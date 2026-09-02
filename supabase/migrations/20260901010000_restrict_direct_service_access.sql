-- Apply only after Preview uses get_public_services(),
-- get_public_service_checkout_config(), and create_service().

DROP POLICY IF EXISTS "Services son públicos para leer" ON public.services;
DROP POLICY IF EXISTS "Owner puede crear services" ON public.services;

REVOKE SELECT, INSERT
ON public.services
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON public.services
TO authenticated;
