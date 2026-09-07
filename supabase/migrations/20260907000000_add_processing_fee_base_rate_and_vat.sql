-- P4E: store the Mercado Pago advertised base rate separately from VAT and
-- derive the effective processing rate used by payment snapshots.
-- A NULL base rate represents legacy effective-only configuration, preserving
-- the exact effective_processing_rate already chosen by existing barbershops.

ALTER TABLE public.barbershops
  ADD COLUMN mp_base_processing_rate numeric(7,6),
  ADD COLUMN processing_fee_vat_rate numeric(7,6) NOT NULL DEFAULT 0.210000;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_mp_base_processing_rate_check
    CHECK (
      mp_base_processing_rate IS NULL
      OR (mp_base_processing_rate >= 0 AND mp_base_processing_rate <= 0.15)
    ),
  ADD CONSTRAINT barbershops_processing_fee_vat_rate_check
    CHECK (processing_fee_vat_rate >= 0 AND processing_fee_vat_rate <= 1),
  ADD CONSTRAINT barbershops_derived_processing_fee_rate_check
    CHECK (
      mp_base_processing_rate IS NULL
      OR effective_processing_rate = round(
        mp_base_processing_rate * (1 + processing_fee_vat_rate),
        6
      )
    );

CREATE FUNCTION public.derive_barbershop_effective_processing_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- NULL deliberately preserves an existing effective-only configuration.
  IF NEW.mp_base_processing_rate IS NOT NULL THEN
    NEW.effective_processing_rate := round(
      NEW.mp_base_processing_rate * (1 + NEW.processing_fee_vat_rate),
      6
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.derive_barbershop_effective_processing_rate()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER derive_barbershop_effective_processing_rate
  BEFORE INSERT OR UPDATE OF
    mp_base_processing_rate,
    processing_fee_vat_rate
  ON public.barbershops
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_barbershop_effective_processing_rate();

ALTER TABLE public.payment_processing_rate_presets
  ADD COLUMN suggested_base_rate numeric(7,6),
  ADD CONSTRAINT payment_processing_rate_presets_base_rate_check
    CHECK (
      suggested_base_rate IS NULL
      OR (suggested_base_rate >= 0 AND suggested_base_rate <= 0.15)
    );

-- These are editable suggestions, not permanent Mercado Pago truths. Future
-- corrections are data changes and do not require an application deployment.
UPDATE public.payment_processing_rate_presets
SET suggested_base_rate = CASE settlement_option
  WHEN 'instant' THEN 0.066000
  WHEN '10_days' THEN 0.046000
  WHEN '18_days' THEN 0.035500
  WHEN '35_days' THEN 0.015600
  ELSE NULL
END;

-- Owners provide the advertised base rate. PostgreSQL derives the effective
-- rate; direct owner writes to the derived column are no longer needed.
REVOKE UPDATE (effective_processing_rate)
ON public.barbershops
FROM authenticated;

GRANT INSERT (mp_base_processing_rate)
ON public.barbershops
TO authenticated;

GRANT UPDATE (mp_base_processing_rate)
ON public.barbershops
TO authenticated;
