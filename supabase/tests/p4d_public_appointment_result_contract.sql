BEGIN;

DO $test$
DECLARE
  v_result text;
BEGIN
  SELECT pg_get_function_result(
    'public.get_public_appointment_result(uuid,uuid)'::regprocedure
  ) INTO v_result;

  IF v_result <> 'TABLE(date date, start_time time without time zone, status text, deposit_status text, deposit_amount numeric, processing_fee_amount numeric, payment_total_amount numeric, processing_fee_mode text, payment_currency text, barber_name text, service_name text, service_price numeric)' THEN
    RAISE EXCEPTION 'Unexpected public appointment result contract: %', v_result;
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_public_appointment_result(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_public_appointment_result(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.get_public_appointment_result(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected public appointment result grants';
  END IF;

  IF v_result ~ '(mp_payment_id|mp_preference_id|client_phone|client_name|owner_id)' THEN
    RAISE EXCEPTION 'Private field exposed by public appointment result';
  END IF;
END;
$test$;

ROLLBACK;