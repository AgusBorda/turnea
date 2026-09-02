-- Store Mercado Pago credentials outside the publicly readable barbershops table.
CREATE TABLE IF NOT EXISTS public.barbershop_payment_credentials (
  barbershop_id  uuid        PRIMARY KEY
                              REFERENCES public.barbershops(id) ON DELETE CASCADE,
  mp_access_token text       NOT NULL,
  mp_user_id      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barbershop_payment_credentials
  ENABLE ROW LEVEL SECURITY;

-- RLS is intentionally enabled without policies. Only the privileged backend
-- role receives table privileges; browser-facing roles are explicitly denied.
REVOKE ALL ON TABLE public.barbershop_payment_credentials FROM PUBLIC;
REVOKE ALL ON TABLE public.barbershop_payment_credentials FROM anon;
REVOKE ALL ON TABLE public.barbershop_payment_credentials FROM authenticated;
GRANT ALL ON TABLE public.barbershop_payment_credentials TO service_role;

DROP TRIGGER IF EXISTS set_updated_at
  ON public.barbershop_payment_credentials;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.barbershop_payment_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS mp_configured boolean NOT NULL DEFAULT false;

-- Preserve any credential already present in the destination if this migration
-- is replayed; the legacy columns remain available during the transition.
INSERT INTO public.barbershop_payment_credentials (
  barbershop_id,
  mp_access_token,
  mp_user_id
)
SELECT
  id,
  mp_access_token,
  mp_user_id
FROM public.barbershops
WHERE mp_access_token IS NOT NULL
ON CONFLICT (barbershop_id) DO NOTHING;

UPDATE public.barbershops
SET mp_configured = true
WHERE mp_access_token IS NOT NULL
  AND mp_configured IS DISTINCT FROM true;
