BEGIN;

CREATE TEMP TABLE p4a_test_barbershops
  (LIKE public.barbershops INCLUDING ALL);

INSERT INTO p4a_test_barbershops (owner_id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'P4A constraint test', 'p4a-constraint-test');

DO $block$
DECLARE
  v_row p4a_test_barbershops%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_row FROM p4a_test_barbershops LIMIT 1;

  IF v_row.processing_fee_mode <> 'barbershop_absorbs'
    OR v_row.mp_settlement_option <> 'custom'
    OR v_row.effective_processing_rate <> 0 THEN
    RAISE EXCEPTION 'P4A_BARBERSHOP_DEFAULTS_FAILED';
  END IF;

  BEGIN
    UPDATE p4a_test_barbershops SET effective_processing_rate = 0.150001;
    RAISE EXCEPTION 'P4A_RATE_MAX_CONSTRAINT_FAILED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE p4a_test_barbershops SET effective_processing_rate = -0.000001;
    RAISE EXCEPTION 'P4A_RATE_MIN_CONSTRAINT_FAILED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE p4a_test_barbershops SET processing_fee_mode = 'invalid';
    RAISE EXCEPTION 'P4A_MODE_CONSTRAINT_FAILED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$block$;

CREATE TEMP TABLE p4a_test_appointments
  (LIKE public.appointments INCLUDING ALL);

INSERT INTO p4a_test_appointments (
  barbershop_id,
  barber_id,
  date,
  start_time,
  end_time,
  deposit_amount,
  processing_fee_amount,
  processing_fee_rate,
  processing_fee_mode,
  payment_currency,
  processing_fee_settlement_option
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  DATE '2099-01-01',
  TIME '10:00',
  TIME '10:30',
  1500.00,
  62.50,
  0.040000,
  'customer_covers',
  'ARS',
  'custom'
);

DO $block$
DECLARE
  v_total numeric(10,2);
BEGIN
  SELECT payment_total_amount
  INTO STRICT v_total
  FROM p4a_test_appointments
  LIMIT 1;

  IF v_total <> 1562.50 THEN
    RAISE EXCEPTION 'P4A_GENERATED_TOTAL_FAILED';
  END IF;

  BEGIN
    INSERT INTO p4a_test_appointments (
      barbershop_id, barber_id, date, start_time, end_time,
      deposit_amount, processing_fee_amount, processing_fee_mode
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      DATE '2099-01-02', TIME '10:00', TIME '10:30',
      1500.00, 1.00, 'barbershop_absorbs'
    );
    RAISE EXCEPTION 'P4A_ABSORBED_FEE_CONSTRAINT_FAILED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.appointments'::regclass
      AND tgname = 'prevent_appointment_financial_snapshot_update'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'P4A_IMMUTABILITY_TRIGGER_MISSING';
  END IF;
END;
$block$;

ROLLBACK;
