-- P5D: atomically disconnect an OAuth credential without deleting financial history.

CREATE OR REPLACE FUNCTION public.disconnect_mercado_pago_oauth_connection(
  p_barbershop_id uuid,
  p_owner_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_credential public.barbershop_payment_credentials%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_barbershop_id IS NULL OR p_owner_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.barbershops
    WHERE id = p_barbershop_id
      AND owner_id = p_owner_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MP_OAUTH_OWNERSHIP_MISMATCH';
  END IF;

  SELECT credential.*
  INTO v_credential
  FROM public.barbershop_payment_credentials AS credential
  WHERE credential.barbershop_id = p_barbershop_id
  FOR UPDATE;

  IF NOT FOUND OR v_credential.credential_source <> 'oauth' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MP_OAUTH_CONNECTION_NOT_FOUND';
  END IF;

  UPDATE public.barbershop_payment_credentials
  SET connection_status = 'disconnected',
      mp_access_token = NULL,
      mp_refresh_token = NULL,
      mp_token_expires_at = NULL,
      oauth_disconnected_at = clock_timestamp()
  WHERE barbershop_id = p_barbershop_id;

  UPDATE public.barbershops
  SET mp_configured = false
  WHERE id = p_barbershop_id;

  RETURN 'disconnected';
END;
$function$;

REVOKE ALL ON FUNCTION public.disconnect_mercado_pago_oauth_connection(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disconnect_mercado_pago_oauth_connection(uuid, uuid)
  TO service_role;
