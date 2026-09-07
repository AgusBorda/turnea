BEGIN;

CREATE TEMP TABLE p4e_test_barbershops
  (LIKE public.barbershops INCLUDING ALL);

INSERT INTO p4e_test_barbershops (
  owner_id,
  name,
  slug,
  effective_processing_rate
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'P4E legacy test',
  'p4e-legacy-test',
  0.060000
);

DO $block$
DECLARE
  v_legacy p4e_test_barbershops%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_legacy FROM p4e_test_barbershops LIMIT 1;

  IF v_legacy.mp_base_processing_rate IS NOT NULL
    OR v_legacy.processing_fee_vat_rate <> 0.210000
    OR v_legacy.effective_processing_rate <> 0.060000 THEN
    RAISE EXCEPTION 'P4E_LEGACY_CONFIGURATION_CHANGED';
  END IF;
END;
$block$;

-- Exercise the production trigger on a real row while keeping DEV unchanged.
DO $block$
DECLARE
  v_barbershop_id uuid;
BEGIN
  SELECT id
  INTO v_barbershop_id
  FROM public.barbershops
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_barbershop_id IS NULL THEN
    RAISE EXCEPTION 'P4E_TEST_REQUIRES_A_BARBERSHOP';
  END IF;

  UPDATE public.barbershops
  SET mp_base_processing_rate = 0.066000,
      processing_fee_vat_rate = 0.210000
  WHERE id = v_barbershop_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops
    WHERE id = v_barbershop_id
      AND mp_base_processing_rate = 0.066000
      AND processing_fee_vat_rate = 0.210000
      AND effective_processing_rate = 0.079860
  ) THEN
    RAISE EXCEPTION 'P4E_EFFECTIVE_RATE_DERIVATION_FAILED';
  END IF;
END;
$block$;

DO $block$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.barbershops', 'effective_processing_rate', 'UPDATE')
    OR NOT has_column_privilege('authenticated', 'public.barbershops', 'mp_base_processing_rate', 'UPDATE')
    OR has_column_privilege('anon', 'public.barbershops', 'mp_base_processing_rate', 'UPDATE') THEN
    RAISE EXCEPTION 'P4E_UNEXPECTED_BARBERSHOP_GRANTS';
  END IF;
END;
$block$;

ROLLBACK;
