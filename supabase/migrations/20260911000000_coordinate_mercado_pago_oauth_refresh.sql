ALTER TABLE public.barbershop_payment_credentials
  ADD COLUMN refresh_claim_id uuid,
  ADD COLUMN refresh_claimed_at timestamptz,
  ADD CONSTRAINT barbershop_payment_credentials_refresh_claim_check CHECK (
    (refresh_claim_id IS NULL AND refresh_claimed_at IS NULL)
    OR (refresh_claim_id IS NOT NULL AND refresh_claimed_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.claim_mercado_pago_oauth_refresh(
  p_barbershop_id uuid,
  p_claim_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_credential public.barbershop_payment_credentials%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  IF p_barbershop_id IS NULL OR p_claim_id IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MP_REFRESH_CLAIM';
  END IF;

  SELECT credential.* INTO v_credential
  FROM public.barbershop_payment_credentials AS credential
  WHERE credential.barbershop_id = p_barbershop_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_credential.credential_source <> 'oauth'
    OR v_credential.connection_status <> 'connected'
    OR NULLIF(btrim(v_credential.mp_refresh_token), '') IS NULL
    OR v_credential.mp_token_expires_at IS NULL THEN
    RETURN 'not_refreshable';
  END IF;
  IF v_credential.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN 'stale';
  END IF;
  IF v_credential.refresh_claim_id IS NOT NULL
    AND v_credential.refresh_claimed_at > v_now - interval '60 seconds' THEN
    RETURN 'busy';
  END IF;

  UPDATE public.barbershop_payment_credentials
  SET refresh_claim_id = p_claim_id,
      refresh_claimed_at = v_now
  WHERE barbershop_id = p_barbershop_id;
  RETURN 'claimed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_mercado_pago_oauth_refresh(
  p_barbershop_id uuid,
  p_claim_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_scope text,
  p_live_mode boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_credential public.barbershop_payment_credentials%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  SELECT credential.* INTO v_credential
  FROM public.barbershop_payment_credentials AS credential
  WHERE credential.barbershop_id = p_barbershop_id
  FOR UPDATE;

  IF NOT FOUND OR v_credential.credential_source <> 'oauth'
    OR v_credential.connection_status <> 'connected'
    OR v_credential.refresh_claim_id IS DISTINCT FROM p_claim_id
    OR v_credential.refresh_claimed_at <= v_now - interval '60 seconds' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MP_OAUTH_REFRESH_CLAIM_INVALID';
  END IF;
  IF NULLIF(btrim(p_access_token), '') IS NULL OR length(btrim(p_access_token)) > 4096
    OR NULLIF(btrim(p_refresh_token), '') IS NULL OR length(btrim(p_refresh_token)) > 4096
    OR p_token_expires_at IS NULL OR p_token_expires_at <= v_now
    OR NULLIF(btrim(p_scope), '') IS NULL OR p_live_mode IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MP_OAUTH_REFRESH';
  END IF;

  UPDATE public.barbershop_payment_credentials
  SET mp_access_token = btrim(p_access_token),
      mp_refresh_token = btrim(p_refresh_token),
      mp_token_expires_at = p_token_expires_at,
      mp_scope = btrim(p_scope),
      mp_live_mode = p_live_mode,
      oauth_refreshed_at = v_now,
      updated_at = v_now,
      refresh_claim_id = NULL,
      refresh_claimed_at = NULL
  WHERE barbershop_id = p_barbershop_id;
  RETURN 'refreshed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_mercado_pago_oauth_refresh(
  p_barbershop_id uuid,
  p_claim_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  UPDATE public.barbershop_payment_credentials
  SET refresh_claim_id = NULL, refresh_claimed_at = NULL
  WHERE barbershop_id = p_barbershop_id AND refresh_claim_id = p_claim_id;
  RETURN CASE WHEN FOUND THEN 'released' ELSE 'unchanged' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_mercado_pago_oauth_reauth_required(
  p_barbershop_id uuid,
  p_claim_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  PERFORM 1 FROM public.barbershop_payment_credentials
  WHERE barbershop_id = p_barbershop_id
    AND credential_source = 'oauth'
    AND connection_status = 'connected'
    AND refresh_claim_id = p_claim_id
    AND refresh_claimed_at > v_now - interval '60 seconds'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MP_OAUTH_REFRESH_CLAIM_INVALID';
  END IF;

  UPDATE public.barbershop_payment_credentials
  SET connection_status = 'reauth_required',
      mp_access_token = NULL,
      mp_refresh_token = NULL,
      mp_token_expires_at = NULL,
      refresh_claim_id = NULL,
      refresh_claimed_at = NULL,
      updated_at = v_now
  WHERE barbershop_id = p_barbershop_id;
  UPDATE public.barbershops SET mp_configured = false WHERE id = p_barbershop_id;
  RETURN 'reauth_required';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_mercado_pago_oauth_refresh(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_mercado_pago_oauth_refresh(uuid, uuid, text, text, timestamptz, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_mercado_pago_oauth_refresh(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_mercado_pago_oauth_reauth_required(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_mercado_pago_oauth_refresh(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mercado_pago_oauth_refresh(uuid, uuid, text, text, timestamptz, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_mercado_pago_oauth_refresh(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_mercado_pago_oauth_reauth_required(uuid, uuid) TO service_role;
