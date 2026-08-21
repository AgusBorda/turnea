CREATE OR REPLACE FUNCTION public.get_public_barbers(
  p_barbershop_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  bio text,
  photo_url text,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_barbershop_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_BARBERSHOP';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops AS barbershop
    WHERE barbershop.id = p_barbershop_id
      AND barbershop.active IS TRUE
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    barber.id,
    barber.name,
    barber.bio,
    barber.photo_url,
    barber.sort_order
  FROM public.barbers AS barber
  WHERE barber.barbershop_id = p_barbershop_id
    AND barber.active IS TRUE
  ORDER BY barber.sort_order NULLS LAST, barber.name, barber.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_barbers(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_public_barbers(uuid)
  TO anon, authenticated;
