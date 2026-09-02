-- Services security phase 1: additive public/owner RPCs, data integrity, and
-- immediate removal of destructive client privileges. Direct public SELECT
-- and owner INSERT remain temporarily for coordinated Preview deployment.

ALTER TABLE public.services
  ADD CONSTRAINT services_name_valid
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT services_description_length
    CHECK (description IS NULL OR char_length(description) <= 500),
  ADD CONSTRAINT services_duration_positive
    CHECK (duration > 0),
  ADD CONSTRAINT services_price_nonnegative
    CHECK (price >= 0),
  ADD CONSTRAINT services_sort_order_nonnegative
    CHECK (sort_order >= 0),
  ADD CONSTRAINT services_barbershop_sort_order_key
    UNIQUE (barbershop_id, sort_order);

CREATE OR REPLACE FUNCTION public.get_public_services(p_barbershop_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  duration integer,
  price numeric,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.name, s.description, s.duration, s.price, s.sort_order
  FROM public.services AS s
  JOIN public.barbershops AS bs ON bs.id = s.barbershop_id
  WHERE s.barbershop_id = p_barbershop_id
    AND s.active IS TRUE
    AND bs.active IS TRUE
  ORDER BY s.sort_order, s.id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_service_checkout_config(
  p_barbershop_id uuid,
  p_service_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  duration integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.name, s.price, s.duration
  FROM public.services AS s
  JOIN public.barbershops AS bs ON bs.id = s.barbershop_id
  WHERE s.id = p_service_id
    AND s.barbershop_id = p_barbershop_id
    AND s.active IS TRUE
    AND bs.active IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.create_service(
  p_barbershop_id uuid,
  p_name text,
  p_description text,
  p_duration integer,
  p_price numeric
)
RETURNS SETOF public.services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(p_name);
  v_description text := NULLIF(btrim(p_description), '');
  v_sort_order integer;
  v_service_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHORIZED';
  END IF;

  PERFORM 1
  FROM public.barbershops AS bs
  WHERE bs.id = p_barbershop_id
    AND bs.owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SERVICE_FORBIDDEN';
  END IF;

  IF v_name IS NULL OR char_length(v_name) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_NAME_REQUIRED';
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_NAME_TOO_LONG';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_DESCRIPTION_TOO_LONG';
  END IF;
  IF p_duration IS NULL OR p_duration <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SERVICE_DURATION';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SERVICE_PRICE';
  END IF;

  SELECT COALESCE(MAX(s.sort_order), -1) + 1
  INTO v_sort_order
  FROM public.services AS s
  WHERE s.barbershop_id = p_barbershop_id;

  INSERT INTO public.services (
    barbershop_id, name, description, duration, price, active, sort_order
  )
  VALUES (
    p_barbershop_id, v_name, v_description, p_duration, p_price, TRUE, v_sort_order
  )
  RETURNING id INTO v_service_id;

  RETURN QUERY
  SELECT s.*
  FROM public.services AS s
  WHERE s.id = v_service_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_services(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_service_checkout_config(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_service(uuid, text, text, integer, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_services(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_checkout_config(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_service(uuid, text, text, integer, numeric) TO authenticated;

DROP POLICY IF EXISTS "Owner puede gestionar services" ON public.services;
DROP POLICY IF EXISTS "Owner puede seleccionar services" ON public.services;
DROP POLICY IF EXISTS "Owner puede crear services" ON public.services;
DROP POLICY IF EXISTS "Owner puede actualizar services" ON public.services;

CREATE POLICY "Owner puede seleccionar services"
ON public.services
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbershops AS bs
    WHERE bs.id = services.barbershop_id AND bs.owner_id = auth.uid()
  )
);

-- Temporary compatibility policy for the deployed pre-RPC creation flow.
CREATE POLICY "Owner puede crear services"
ON public.services
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbershops AS bs
    WHERE bs.id = services.barbershop_id AND bs.owner_id = auth.uid()
  )
);

CREATE POLICY "Owner puede actualizar services"
ON public.services
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbershops AS bs
    WHERE bs.id = services.barbershop_id AND bs.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbershops AS bs
    WHERE bs.id = services.barbershop_id AND bs.owner_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.services
FROM PUBLIC, anon, authenticated;

-- Temporary compatibility grant for the deployed pre-RPC creation flow.
GRANT INSERT (barbershop_id, name, description, duration, price, sort_order)
ON public.services
TO authenticated;

GRANT UPDATE (name, description, duration, price, active)
ON public.services
TO authenticated;
