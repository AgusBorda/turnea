-- P4A: per-barbershop processing-cost configuration and immutable appointment
-- financial snapshots. Checkout and webhook behavior remain unchanged here.

ALTER TABLE public.barbershops
  ADD COLUMN processing_fee_mode text NOT NULL DEFAULT 'barbershop_absorbs',
  ADD COLUMN mp_settlement_option text NOT NULL DEFAULT 'custom',
  ADD COLUMN effective_processing_rate numeric(7,6) NOT NULL DEFAULT 0;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_processing_fee_mode_check
    CHECK (processing_fee_mode IN ('barbershop_absorbs', 'customer_covers')),
  ADD CONSTRAINT barbershops_mp_settlement_option_check
    CHECK (mp_settlement_option IN ('instant', '10_days', '18_days', '35_days', 'custom')),
  ADD CONSTRAINT barbershops_effective_processing_rate_check
    CHECK (effective_processing_rate >= 0 AND effective_processing_rate <= 0.15);

-- Legacy appointments used a nullable deposit_amount even though every current
-- creation path writes a monetary value. Normalize it before adding the snapshot.
UPDATE public.appointments
SET deposit_amount = 0
WHERE deposit_amount IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN deposit_amount SET DEFAULT 0,
  ALTER COLUMN deposit_amount SET NOT NULL,
  ADD COLUMN processing_fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN processing_fee_rate numeric(7,6) NOT NULL DEFAULT 0,
  ADD COLUMN processing_fee_mode text NOT NULL DEFAULT 'barbershop_absorbs',
  ADD COLUMN payment_total_amount numeric(10,2)
    GENERATED ALWAYS AS (deposit_amount + processing_fee_amount) STORED,
  ADD COLUMN payment_currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN processing_fee_settlement_option text NOT NULL DEFAULT 'custom';

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_deposit_amount_check
    CHECK (deposit_amount >= 0 AND deposit_amount = round(deposit_amount, 2)),
  ADD CONSTRAINT appointments_processing_fee_amount_check
    CHECK (processing_fee_amount >= 0 AND processing_fee_amount = round(processing_fee_amount, 2)),
  ADD CONSTRAINT appointments_processing_fee_rate_check
    CHECK (processing_fee_rate >= 0 AND processing_fee_rate <= 0.15),
  ADD CONSTRAINT appointments_processing_fee_mode_check
    CHECK (processing_fee_mode IN ('barbershop_absorbs', 'customer_covers')),
  ADD CONSTRAINT appointments_absorbed_processing_fee_check
    CHECK (processing_fee_mode <> 'barbershop_absorbs' OR processing_fee_amount = 0),
  ADD CONSTRAINT appointments_payment_currency_check
    CHECK (payment_currency = upper(btrim(payment_currency)) AND payment_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT appointments_processing_fee_settlement_option_check
    CHECK (processing_fee_settlement_option IN ('instant', '10_days', '18_days', '35_days', 'custom'));

CREATE OR REPLACE FUNCTION public.prevent_appointment_financial_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
    OR NEW.processing_fee_amount IS DISTINCT FROM OLD.processing_fee_amount
    OR NEW.processing_fee_rate IS DISTINCT FROM OLD.processing_fee_rate
    OR NEW.processing_fee_mode IS DISTINCT FROM OLD.processing_fee_mode
    OR NEW.payment_currency IS DISTINCT FROM OLD.payment_currency
    OR NEW.processing_fee_settlement_option IS DISTINCT FROM OLD.processing_fee_settlement_option THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'APPOINTMENT_FINANCIAL_SNAPSHOT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_appointment_financial_snapshot_update()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER prevent_appointment_financial_snapshot_update
  BEFORE UPDATE OF
    deposit_amount,
    processing_fee_amount,
    processing_fee_rate,
    processing_fee_mode,
    payment_currency,
    processing_fee_settlement_option
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_appointment_financial_snapshot_update();

CREATE TABLE public.payment_processing_rate_presets (
  settlement_option text PRIMARY KEY,
  label text NOT NULL,
  suggested_effective_rate numeric(7,6),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT payment_processing_rate_presets_option_check
    CHECK (settlement_option IN ('instant', '10_days', '18_days', '35_days', 'custom')),
  CONSTRAINT payment_processing_rate_presets_label_check
    CHECK (btrim(label) <> '' AND length(label) <= 80),
  CONSTRAINT payment_processing_rate_presets_rate_check
    CHECK (
      suggested_effective_rate IS NULL
      OR (suggested_effective_rate >= 0 AND suggested_effective_rate <= 0.15)
    ),
  CONSTRAINT payment_processing_rate_presets_sort_order_check
    CHECK (sort_order >= 0)
);

ALTER TABLE public.payment_processing_rate_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads processing rate presets"
  ON public.payment_processing_rate_presets
  FOR SELECT
  TO authenticated
  USING (active IS TRUE);

REVOKE ALL ON public.payment_processing_rate_presets
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.payment_processing_rate_presets TO authenticated;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payment_processing_rate_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Rates deliberately remain NULL until a reviewed source/version is approved.
-- Presets are labels and suggestions only; barbershops persist the effective rate.
INSERT INTO public.payment_processing_rate_presets (
  settlement_option,
  label,
  suggested_effective_rate,
  sort_order
)
VALUES
  ('instant', 'Al instante', NULL, 10),
  ('10_days', '10 días', NULL, 20),
  ('18_days', '18 días', NULL, 30),
  ('35_days', '35 días', NULL, 40),
  ('custom', 'Personalizado', NULL, 50);

-- Preserve the existing narrow owner update surface and add only the P4A
-- configuration columns. RLS still restricts rows to auth.uid() = owner_id.
GRANT UPDATE (
  processing_fee_mode,
  mp_settlement_option,
  effective_processing_rate
)
ON public.barbershops
TO authenticated;

GRANT INSERT (
  processing_fee_mode,
  mp_settlement_option,
  effective_processing_rate
)
ON public.barbershops
TO authenticated;
