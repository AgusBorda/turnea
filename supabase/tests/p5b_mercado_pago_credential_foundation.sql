BEGIN;

CREATE TEMP TABLE p5b_context (
  barbershop_id uuid NOT NULL,
  owner_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.p5b_context (barbershop_id, owner_id)
SELECT id, owner_id
FROM public.barbershops
ORDER BY created_at
LIMIT 1;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_temp.p5b_context) THEN
    RAISE EXCEPTION 'P5B_TEST_REQUIRES_A_BARBERSHOP';
  END IF;

  IF has_table_privilege('anon', 'public.barbershop_payment_credentials', 'SELECT')
    OR has_table_privilege('authenticated', 'public.barbershop_payment_credentials', 'SELECT')
    OR has_table_privilege('anon', 'public.mercado_pago_oauth_attempts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.mercado_pago_oauth_attempts', 'SELECT') THEN
    RAISE EXCEPTION 'P5B_PRIVATE_TABLE_GRANT_FAILURE';
  END IF;

  IF has_function_privilege('anon', 'public.store_manual_mercado_pago_credential(uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.store_manual_mercado_pago_credential(uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.complete_mercado_pago_oauth_connection(bytea,uuid,text,text,timestamptz,text,text,boolean,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.complete_mercado_pago_oauth_connection(bytea,uuid,text,text,timestamptz,text,text,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P5B_PRIVATE_FUNCTION_GRANT_FAILURE';
  END IF;
END;
$block$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_owner_id uuid;
  v_state_hash bytea := decode(repeat('ab', 32), 'hex');
  v_result text;
BEGIN
  SELECT barbershop_id, owner_id
  INTO STRICT v_barbershop_id, v_owner_id
  FROM pg_temp.p5b_context;

  INSERT INTO public.mercado_pago_oauth_attempts (
    state_hash,
    barbershop_id,
    initiated_by,
    code_verifier_secret,
    expires_at
  ) VALUES (
    v_state_hash,
    v_barbershop_id,
    v_owner_id,
    repeat('A', 43),
    clock_timestamp() + interval '10 minutes'
  );

  SELECT public.complete_mercado_pago_oauth_connection(
    v_state_hash,
    v_owner_id,
    'P5B_TEST_ACCESS_TOKEN',
    'P5B_TEST_REFRESH_TOKEN',
    clock_timestamp() + interval '180 days',
    '123456789',
    'read write offline_access',
    false,
    '987654321'
  ) INTO v_result;

  IF v_result <> 'connected' OR NOT EXISTS (
    SELECT 1
    FROM public.barbershop_payment_credentials
    WHERE barbershop_id = v_barbershop_id
      AND credential_source = 'oauth'
      AND connection_status = 'connected'
      AND mp_user_id = '123456789'
      AND mp_refresh_token IS NOT NULL
      AND mp_token_expires_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.mercado_pago_oauth_attempts
    WHERE state_hash = v_state_hash
      AND consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'P5B_OAUTH_COMPLETION_FAILED';
  END IF;

  BEGIN
    PERFORM public.complete_mercado_pago_oauth_connection(
      v_state_hash,
      v_owner_id,
      'P5B_OTHER_ACCESS_TOKEN',
      'P5B_OTHER_REFRESH_TOKEN',
      clock_timestamp() + interval '180 days',
      '123456789',
      'read write offline_access',
      false,
      '987654321'
    );
    RAISE EXCEPTION 'P5B_ONE_TIME_GUARD_NOT_ENFORCED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'MP_OAUTH_ATTEMPT_ALREADY_CONSUMED' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.store_manual_mercado_pago_credential(
    v_barbershop_id,
    'P5B_MANUAL_ACCESS_TOKEN'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershop_payment_credentials
    WHERE barbershop_id = v_barbershop_id
      AND credential_source = 'manual'
      AND connection_status = 'connected'
      AND mp_refresh_token IS NULL
      AND mp_token_expires_at IS NULL
      AND mp_scope IS NULL
      AND mp_live_mode IS NULL
      AND oauth_connected_at IS NULL
      AND oauth_refreshed_at IS NULL
      AND oauth_disconnected_at IS NULL
      AND oauth_application_id IS NULL
  ) THEN
    RAISE EXCEPTION 'P5B_MANUAL_OVERWRITE_DID_NOT_CLEAR_OAUTH_METADATA';
  END IF;
END;
$block$;

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_owner_id uuid;
  v_state_hash bytea := decode(repeat('cd', 32), 'hex');
BEGIN
  SELECT barbershop_id, owner_id
  INTO STRICT v_barbershop_id, v_owner_id
  FROM pg_temp.p5b_context;

  INSERT INTO public.mercado_pago_oauth_attempts (
    state_hash,
    barbershop_id,
    initiated_by,
    code_verifier_secret,
    created_at,
    expires_at
  ) VALUES (
    v_state_hash,
    v_barbershop_id,
    v_owner_id,
    repeat('B', 43),
    clock_timestamp() - interval '20 minutes',
    clock_timestamp() - interval '10 minutes'
  );

  BEGIN
    PERFORM public.complete_mercado_pago_oauth_connection(
      v_state_hash,
      v_owner_id,
      'P5B_EXPIRED_ACCESS_TOKEN',
      'P5B_EXPIRED_REFRESH_TOKEN',
      clock_timestamp() + interval '180 days',
      '123456789',
      'read write offline_access',
      false,
      '987654321'
    );
    RAISE EXCEPTION 'P5B_EXPIRED_ATTEMPT_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'MP_OAUTH_ATTEMPT_EXPIRED' THEN
        RAISE;
      END IF;
  END;
END;
$block$;

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_owner_id uuid;
  v_state_hash bytea := decode(repeat('ef', 32), 'hex');
BEGIN
  SELECT barbershop_id, owner_id
  INTO STRICT v_barbershop_id, v_owner_id
  FROM pg_temp.p5b_context;

  INSERT INTO public.mercado_pago_oauth_attempts (
    state_hash,
    barbershop_id,
    initiated_by,
    code_verifier_secret,
    expires_at
  ) VALUES (
    v_state_hash,
    v_barbershop_id,
    v_owner_id,
    repeat('C', 43),
    clock_timestamp() + interval '10 minutes'
  );

  BEGIN
    PERFORM public.complete_mercado_pago_oauth_connection(
      v_state_hash,
      gen_random_uuid(),
      'P5B_WRONG_OWNER_ACCESS_TOKEN',
      'P5B_WRONG_OWNER_REFRESH_TOKEN',
      clock_timestamp() + interval '180 days',
      '123456789',
      'read write offline_access',
      false,
      '987654321'
    );
    RAISE EXCEPTION 'P5B_OWNERSHIP_MISMATCH_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'MP_OAUTH_OWNERSHIP_MISMATCH' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.mercado_pago_oauth_attempts
    WHERE state_hash = v_state_hash
      AND consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'P5B_FAILED_ATTEMPT_MUTATED_STATE';
  END IF;
END;
$block$;

ROLLBACK;
