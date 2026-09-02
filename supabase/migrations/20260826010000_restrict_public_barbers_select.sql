-- COORDINATION REQUIRED: do not apply until every anon consumer, including
-- /api/checkout, has stopped selecting directly from public.barbers.
DROP POLICY IF EXISTS "Barbers son públicos para leer" ON public.barbers;

REVOKE SELECT ON TABLE public.barbers FROM PUBLIC, anon;

-- The existing "Owner puede gestionar barberos" policy continues to scope
-- authenticated access to barbershops owned by auth.uid(). Table privileges
-- for authenticated and service_role remain unchanged.
