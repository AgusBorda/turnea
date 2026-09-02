CREATE OR REPLACE FUNCTION public.is_public_barber_active(
  p_barbershop_id uuid,
  p_barber_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbers AS barber
    INNER JOIN public.barbershops AS barbershop
      ON barbershop.id = barber.barbershop_id
    WHERE barber.id = p_barber_id
      AND barber.barbershop_id = p_barbershop_id
      AND barber.active IS TRUE
      AND barbershop.active IS TRUE
  );
$function$;

REVOKE ALL ON FUNCTION public.is_public_barber_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_public_barber_active(uuid, uuid)
  TO anon, authenticated;
