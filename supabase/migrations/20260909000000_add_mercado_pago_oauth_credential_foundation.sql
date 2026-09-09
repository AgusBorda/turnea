-- P5B: private Mercado Pago OAuth credential foundation.
-- Secrets remain isolated in service-role-only tables. Application-level
-- encryption at rest is intentionally deferred until Turnea has reviewed key
-- management; this migration does not introduce ad-hoc cryptography.

ALTER TABLE public.barbershop_payment_credentials
  ALTER COLUMN mp_access_token DROP NOT NULL,
  ADD COLUMN credential_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN connection_status text NOT NULL DEFAULT 'connected',
  ADD COLUMN mp_refresh_token text,
  ADD COLUMN mp_token_expires_at timestamptz,
  ADD COLUMN mp_scope text,
  ADD COLUMN mp_live_mode boolean,
  ADD COLUMN oauth_connected_at timestamptz,
  ADD COLUMN oauth_refreshed_at timestamptz,
  ADD COLUMN oauth_disconnected_at timestamptz,
  ADD COLUMN oauth_application_id text;

ALTER TABLE public.barbershop_payment_credentials
  ADD CONSTRAINT barbershop_payment_credentials_source_check
    CHECK (credential_source IN ('manual', 'oauth')),
  ADD CONSTRAINT barbershop_payment_credentials_status_check
    CHECK (connection_status IN ('connected', 'disconnected', 'reauth_required')),
  ADD CONSTRAINT barbershop_payment_credentials_connected_check
    CHECK (
      connection_status <> 'connected'
      OR NULLIF(btrim(mp_access_token), '') IS NOT NULL
    ),
  ADD CONSTRAINT barbershop_payment_credentials_manual_check
    CHECK (
      credential_source <> 'manual'
      OR (
        connection_status = 'connected'
        AND mp_refresh_token IS NULL
        AND mp_token_expires_at IS NULL
        AND oauth_connected_at IS NULL
        AND oauth_refreshed_at IS NULL
        AND oauth_disconnected_at IS NULL
        AND oauth_application_id IS NULL
      )
    ),
  ADD CONSTRAINT barbershop_payment_credentials_oauth_connected_check
    CHECK (
      credential_source <> 'oauth'
      OR connection_status <> 'connected'
      OR (
        NULLIF(btrim(mp_access_token), '') IS NOT NULL
        AND NULLIF(btrim(mp_refresh_token), '') IS NOT NULL
        AND mp_token_expires_at IS NOT NULL
        AND NULLIF(btrim(mp_user_id), '') IS NOT NULL
        AND NULLIF(btrim(mp_scope), '') IS NOT NULL
        AND oauth_connected_at IS NOT NULL
        AND NULLIF(btrim(oauth_application_id), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT barbershop_payment_credentials_inactive_secret_check
    CHECK (
      connection_status = 'connected'
      OR (
        mp_access_token IS NULL
        AND mp_refresh_token IS NULL
        AND mp_token_expires_at IS NULL
      )
    );

CREATE TABLE public.mercado_pago_oauth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash bytea NOT NULL UNIQUE,
  barbershop_id uuid NOT NULL
    REFERENCES public.barbershops(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier_secret text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT mercado_pago_oauth_attempts_state_hash_check
    CHECK (octet_length(state_hash) = 32),
  CONSTRAINT mercado_pago_oauth_attempts_verifier_check
    CHECK (
      code_verifier_secret = btrim(code_verifier_secret)
      AND length(code_verifier_secret) BETWEEN 43 AND 128
      AND code_verifier_secret ~ '^[A-Za-z0-9._~-]+$'
    ),
  CONSTRAINT mercado_pago_oauth_attempts_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT mercado_pago_oauth_attempts_consumed_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX mercado_pago_oauth_attempts_barbershop_created_idx
  ON public.mercado_pago_oauth_attempts (barbershop_id, created_at DESC);

CREATE INDEX mercado_pago_oauth_attempts_expiry_idx
  ON public.mercado_pago_oauth_attempts (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.mercado_pago_oauth_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mercado_pago_oauth_attempts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mercado_pago_oauth_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.store_manual_mercado_pago_credential(
  p_barbershop_id uuid,
  p_access_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_access_token text := btrim(p_access_token);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_barbershop_id IS NULL
    OR v_access_token IS NULL
    OR v_access_token = ''
    OR length(v_access_token) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MP_CREDENTIAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops WHERE id = p_barbershop_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BARBERSHOP_NOT_FOUND';
  END IF;

  INSERT INTO public.barbershop_payment_credentials (
    barbershop_id,
    mp_access_token,
    mp_user_id,
    credential_source,
    connection_status,
    mp_refresh_token,
    mp_token_expires_at,
    mp_scope,
    mp_live_mode,
    oauth_connected_at,
    oauth_refreshed_at,
    oauth_disconnected_at,
    oauth_application_id
  ) VALUES (
    p_barbershop_id,
    v_access_token,
    NULL,
    'manual',
    'connected',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (barbershop_id) DO UPDATE
  SET
    mp_access_token = EXCLUDED.mp_access_token,
    mp_user_id = NULL,
    credential_source = 'manual',
    connection_status = 'connected',
    mp_refresh_token = NULL,
    mp_token_expires_at = NULL,
    mp_scope = NULL,
    mp_live_mode = NULL,
    oauth_connected_at = NULL,
    oauth_refreshed_at = NULL,
    oauth_disconnected_at = NULL,
    oauth_application_id = NULL;

  UPDATE public.barbershops
  SET mp_configured = true
  WHERE id = p_barbershop_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_mercado_pago_oauth_connection(
  p_state_hash bytea,
  p_initiated_by uuid,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_mp_user_id text,
  p_scope text,
  p_live_mode boolean,
  p_application_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.mercado_pago_oauth_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_access_token text := btrim(p_access_token);
  v_refresh_token text := btrim(p_refresh_token);
  v_mp_user_id text := btrim(p_mp_user_id);
  v_scope text := btrim(p_scope);
  v_application_id text := btrim(p_application_id);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_state_hash IS NULL
    OR octet_length(p_state_hash) <> 32
    OR p_initiated_by IS NULL
    OR NULLIF(v_access_token, '') IS NULL
    OR length(v_access_token) > 4096
    OR NULLIF(v_refresh_token, '') IS NULL
    OR length(v_refresh_token) > 4096
    OR p_token_expires_at IS NULL
    OR p_token_expires_at <= v_now
    OR NULLIF(v_mp_user_id, '') IS NULL
    OR NULLIF(v_scope, '') IS NULL
    OR p_live_mode IS NULL
    OR NULLIF(v_application_id, '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MP_OAUTH_CREDENTIAL';
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM public.mercado_pago_oauth_attempts AS attempt
  WHERE attempt.state_hash = p_state_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MP_OAUTH_ATTEMPT_NOT_FOUND';
  END IF;

  IF v_attempt.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MP_OAUTH_ATTEMPT_ALREADY_CONSUMED';
  END IF;

  IF v_attempt.expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MP_OAUTH_ATTEMPT_EXPIRED';
  END IF;

  IF v_attempt.initiated_by IS DISTINCT FROM p_initiated_by
    OR NOT EXISTS (
      SELECT 1
      FROM public.barbershops
      WHERE id = v_attempt.barbershop_id
        AND owner_id = p_initiated_by
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MP_OAUTH_OWNERSHIP_MISMATCH';
  END IF;

  INSERT INTO public.barbershop_payment_credentials (
    barbershop_id,
    mp_access_token,
    mp_user_id,
    credential_source,
    connection_status,
    mp_refresh_token,
    mp_token_expires_at,
    mp_scope,
    mp_live_mode,
    oauth_connected_at,
    oauth_refreshed_at,
    oauth_disconnected_at,
    oauth_application_id
  ) VALUES (
    v_attempt.barbershop_id,
    v_access_token,
    v_mp_user_id,
    'oauth',
    'connected',
    v_refresh_token,
    p_token_expires_at,
    v_scope,
    p_live_mode,
    v_now,
    NULL,
    NULL,
    v_application_id
  )
  ON CONFLICT (barbershop_id) DO UPDATE
  SET
    mp_access_token = EXCLUDED.mp_access_token,
    mp_user_id = EXCLUDED.mp_user_id,
    credential_source = 'oauth',
    connection_status = 'connected',
    mp_refresh_token = EXCLUDED.mp_refresh_token,
    mp_token_expires_at = EXCLUDED.mp_token_expires_at,
    mp_scope = EXCLUDED.mp_scope,
    mp_live_mode = EXCLUDED.mp_live_mode,
    oauth_connected_at = v_now,
    oauth_refreshed_at = NULL,
    oauth_disconnected_at = NULL,
    oauth_application_id = EXCLUDED.oauth_application_id;

  UPDATE public.barbershops
  SET mp_configured = true
  WHERE id = v_attempt.barbershop_id;

  UPDATE public.mercado_pago_oauth_attempts
  SET consumed_at = v_now
  WHERE id = v_attempt.id;

  RETURN 'connected';
END;
$function$;

REVOKE ALL ON FUNCTION public.store_manual_mercado_pago_credential(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_mercado_pago_oauth_connection(bytea, uuid, text, text, timestamptz, text, text, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.store_manual_mercado_pago_credential(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mercado_pago_oauth_connection(bytea, uuid, text, text, timestamptz, text, text, boolean, text)
  TO service_role;
