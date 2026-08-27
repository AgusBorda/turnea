-- Apply only after Preview uses the public barbershop RPCs introduced in
-- 20260831000000_harden_core_barbershops_and_legacy_clients.sql.

DROP POLICY IF EXISTS "Barbershops son públicas para leer"
ON public.barbershops;

REVOKE SELECT
ON public.barbershops
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON public.barbershops
TO authenticated;
