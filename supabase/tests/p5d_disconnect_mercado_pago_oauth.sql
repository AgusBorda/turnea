BEGIN;

CREATE TEMP TABLE p5d_context (
  barbershop_id uuid NOT NULL,
  owner_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.p5d_context (barbershop_id, owner_id)
SELECT id, owner_id
FROM public.barbershops
ORDER BY created_at
LIMIT 1;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_temp.p5d_context) THEN
    RAISE EXCEPTION 'P5D_TEST_REQUIRES_A_BARBERSHOP';
  END IF;

  IF has_function_privilege('anon', 'public.disconnect_mercado_pago_oauth_connection(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.disconnect_mercado_pago_oauth_connection(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P5D_PRIVATE_FUNCTION_GRANT_FAILURE';
  END IF;
END;
$block$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_owner_id uuid;
  v_state_hash bytea := decode(repeat('91', 32), 'hex');
  v_result text;
BEGIN
  SELECT barbershop_id, owner_id
  INTO STRICT v_barbershop_id, v_owner_id
  FROM pg_temp.p5d_context;

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
    repeat('D', 43),
    clock_timestamp() + interval '10 minutes'
  );

  PERFORM public.complete_mercado_pago_oauth_connection(
    v_state_hash,
    v_owner_id,
    'P5D_TEST_ACCESS_TOKEN',
    'P5D_TEST_REFRESH_TOKEN',
    clock_timestamp() + interval '180 days',
    '123456789',
    'read write offline_access',
    false,
    '987654321'
  );

  BEGIN
    PERFORM public.disconnect_mercado_pago_oauth_connection(
      v_barbershop_id,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'P5D_OWNERSHIP_MISMATCH_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'MP_OAUTH_OWNERSHIP_MISMATCH' THEN
        RAISE;
      END IF;
  END;

  SELECT public.disconnect_mercado_pago_oauth_connection(
    v_barbershop_id,
    v_owner_id
  ) INTO v_result;

  IF v_result <> 'disconnected'
    OR NOT EXISTS (
      SELECT 1
      FROM public.barbershop_payment_credentials
      WHERE barbershop_id = v_barbershop_id
        AND credential_source = 'oauth'
        AND connection_status = 'disconnected'
        AND mp_access_token IS NULL
        AND mp_refresh_token IS NULL
        AND mp_token_expires_at IS NULL
        AND mp_user_id = '123456789'
        AND oauth_disconnected_at IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.barbershops
      WHERE id = v_barbershop_id
        AND mp_configured = false
    ) THEN
    RAISE EXCEPTION 'P5D_OAUTH_DISCONNECT_FAILED';
  END IF;
END;
$block$;

ROLLBACK;
