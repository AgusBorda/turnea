-- Core Security S1/S2: minimal public barbershop contracts, explicit owner
-- permissions, and dormant legacy client tables.

CREATE OR REPLACE FUNCTION public.get_public_barbershop_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  address text,
  phone text,
  instagram text,
  logo_url text,
  slot_duration integer,
  deposit_required boolean,
  deposit_percentage integer,
  advance_booking_days integer,
  timezone text,
  mp_configured boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bs.id,
    bs.name,
    bs.slug,
    bs.description,
    bs.address,
    bs.phone,
    bs.instagram,
    bs.logo_url,
    bs.slot_duration,
    bs.deposit_required,
    bs.deposit_percentage,
    bs.advance_booking_days,
    bs.timezone,
    bs.mp_configured
  FROM public.barbershops AS bs
  WHERE bs.slug = p_slug
    AND bs.active IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.get_public_barbershop_checkout_config(
  p_barbershop_id uuid
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  currency text,
  timezone text,
  deposit_required boolean,
  deposit_percentage integer,
  mp_configured boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bs.id,
    bs.slug,
    bs.name,
    bs.currency,
    bs.timezone,
    bs.deposit_required,
    bs.deposit_percentage,
    bs.mp_configured
  FROM public.barbershops AS bs
  WHERE bs.id = p_barbershop_id
    AND bs.active IS TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_public_barbershop_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_barbershop_checkout_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_barbershop_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_barbershop_checkout_config(uuid) TO anon, authenticated;

-- Remove the legacy broad owner policy and replace it with operation-specific
-- ownership checks. The public active-row SELECT policy remains temporarily for
-- deploy compatibility and is removed by the coordinated restrictive migration.
DROP POLICY IF EXISTS "Owner puede gestionar su barbería" ON public.barbershops;
DROP POLICY IF EXISTS "Owner puede seleccionar su barbería" ON public.barbershops;
DROP POLICY IF EXISTS "Owner puede crear su barbería" ON public.barbershops;
DROP POLICY IF EXISTS "Owner puede actualizar su barbería" ON public.barbershops;

CREATE POLICY "Owner puede seleccionar su barbería"
ON public.barbershops
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Owner puede crear su barbería"
ON public.barbershops
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner puede actualizar su barbería"
ON public.barbershops
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.barbershops
FROM PUBLIC, anon, authenticated;

GRANT INSERT (
  owner_id,
  name,
  slug,
  description,
  address,
  phone,
  instagram,
  timezone,
  slot_duration,
  deposit_required,
  deposit_percentage,
  advance_booking_days
)
ON public.barbershops
TO authenticated;

GRANT UPDATE (
  name,
  slug,
  description,
  address,
  phone,
  instagram,
  timezone,
  slot_duration,
  deposit_required,
  deposit_percentage,
  advance_booking_days
)
ON public.barbershops
TO authenticated;

-- These tables are not part of any current product flow. Keep them available
-- to service_role while removing every direct public/client path.
DROP POLICY IF EXISTS "Clients insert público" ON public.clients;
DROP POLICY IF EXISTS "Clients acceso por barbershop" ON public.clients;
DROP POLICY IF EXISTS "Owner puede actualizar clients" ON public.clients;
DROP POLICY IF EXISTS "Client barbershop insert público" ON public.client_barbershop;
DROP POLICY IF EXISTS "Owner ve client_barbershop" ON public.client_barbershop;

REVOKE ALL ON public.clients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.client_barbershop FROM PUBLIC, anon, authenticated;
