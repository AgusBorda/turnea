-- Remove the legacy Mercado Pago columns only after verifying that every
-- relevant value has a safe counterpart in the private credentials table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.barbershops AS b
    LEFT JOIN public.barbershop_payment_credentials AS c
      ON c.barbershop_id = b.id
    WHERE NULLIF(btrim(b.mp_access_token), '') IS NOT NULL
      AND NULLIF(btrim(c.mp_access_token), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGACY_MP_ACCESS_TOKEN_NOT_MIGRATED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.barbershops AS b
    LEFT JOIN public.barbershop_payment_credentials AS c
      ON c.barbershop_id = b.id
    WHERE NULLIF(btrim(b.mp_user_id), '') IS NOT NULL
      AND b.mp_user_id IS DISTINCT FROM c.mp_user_id
  ) THEN
    RAISE EXCEPTION 'LEGACY_MP_USER_ID_NOT_MIGRATED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.barbershops AS b
    LEFT JOIN public.barbershop_payment_credentials AS c
      ON c.barbershop_id = b.id
    WHERE b.mp_configured IS TRUE
      AND NULLIF(btrim(c.mp_access_token), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'MP_CONFIGURED_WITHOUT_PRIVATE_CREDENTIAL';
  END IF;
END;
$$;

ALTER TABLE public.barbershops
  DROP COLUMN mp_access_token,
  DROP COLUMN mp_user_id;
