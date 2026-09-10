BEGIN;

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_updated_at timestamptz;
  v_claim_1 uuid := gen_random_uuid();
  v_claim_2 uuid := gen_random_uuid();
  v_claim_3 uuid := gen_random_uuid();
  v_claim_4 uuid := gen_random_uuid();
  v_result text;
  v_access_before text;
  v_refresh_before text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  SELECT barbershop_id, updated_at
  INTO STRICT v_barbershop_id, v_updated_at
  FROM public.barbershop_payment_credentials
  WHERE credential_source = 'oauth' AND connection_status = 'connected'
  ORDER BY updated_at
  LIMIT 1;

  SELECT public.claim_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_1, v_updated_at)
  INTO v_result;
  IF v_result <> 'claimed' THEN RAISE EXCEPTION 'P5E_FIRST_CLAIM_FAILED'; END IF;

  SELECT updated_at INTO v_updated_at FROM public.barbershop_payment_credentials
  WHERE barbershop_id = v_barbershop_id;
  SELECT public.claim_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_2, v_updated_at)
  INTO v_result;
  IF v_result <> 'busy' THEN RAISE EXCEPTION 'P5E_SECOND_CLAIM_NOT_BLOCKED'; END IF;

  UPDATE public.barbershop_payment_credentials
  SET refresh_claimed_at = clock_timestamp() - interval '61 seconds'
  WHERE barbershop_id = v_barbershop_id;
  SELECT updated_at INTO v_updated_at FROM public.barbershop_payment_credentials
  WHERE barbershop_id = v_barbershop_id;
  SELECT public.claim_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_2, v_updated_at)
  INTO v_result;
  IF v_result <> 'claimed' THEN RAISE EXCEPTION 'P5E_EXPIRED_CLAIM_NOT_RECOVERED'; END IF;

  BEGIN
    PERFORM public.complete_mercado_pago_oauth_refresh(
      v_barbershop_id, v_claim_1, 'stale-access', 'stale-refresh',
      clock_timestamp() + interval '1 hour', 'read write offline_access', false
    );
    RAISE EXCEPTION 'P5E_STALE_CLAIM_COMPLETED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MP_OAUTH_REFRESH_CLAIM_INVALID' THEN RAISE; END IF;
  END;

  SELECT public.complete_mercado_pago_oauth_refresh(
    v_barbershop_id, v_claim_2, 'p5e-new-access', 'p5e-new-refresh',
    clock_timestamp() + interval '6 hours', 'read write offline_access', false
  ) INTO v_result;
  IF v_result <> 'refreshed' OR NOT EXISTS (
    SELECT 1 FROM public.barbershop_payment_credentials
    WHERE barbershop_id = v_barbershop_id
      AND mp_access_token = 'p5e-new-access'
      AND mp_refresh_token = 'p5e-new-refresh'
      AND oauth_refreshed_at IS NOT NULL
      AND refresh_claim_id IS NULL
  ) THEN RAISE EXCEPTION 'P5E_COMPLETE_FAILED'; END IF;

  SELECT updated_at, mp_access_token, mp_refresh_token
  INTO v_updated_at, v_access_before, v_refresh_before
  FROM public.barbershop_payment_credentials WHERE barbershop_id = v_barbershop_id;
  PERFORM public.claim_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_3, v_updated_at);
  PERFORM public.release_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_3);
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershop_payment_credentials
    WHERE barbershop_id = v_barbershop_id AND refresh_claim_id IS NULL
      AND mp_access_token = v_access_before AND mp_refresh_token = v_refresh_before
  ) THEN RAISE EXCEPTION 'P5E_RELEASE_MUTATED_TOKENS'; END IF;

  SELECT updated_at INTO v_updated_at FROM public.barbershop_payment_credentials
  WHERE barbershop_id = v_barbershop_id;
  PERFORM public.claim_mercado_pago_oauth_refresh(v_barbershop_id, v_claim_4, v_updated_at);
  PERFORM public.mark_mercado_pago_oauth_reauth_required(v_barbershop_id, v_claim_4);
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershop_payment_credentials AS credential
    JOIN public.barbershops AS shop ON shop.id = credential.barbershop_id
    WHERE credential.barbershop_id = v_barbershop_id
      AND credential.connection_status = 'reauth_required'
      AND credential.mp_access_token IS NULL
      AND credential.mp_refresh_token IS NULL
      AND credential.mp_token_expires_at IS NULL
      AND credential.refresh_claim_id IS NULL
      AND shop.mp_configured = false
  ) THEN RAISE EXCEPTION 'P5E_REAUTH_TRANSITION_FAILED'; END IF;
END;
$block$;

ROLLBACK;
