CREATE OR REPLACE FUNCTION public.get_public_blocked_slots(
  p_barbershop_id uuid,
  p_barber_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  date date,
  start_time time without time zone,
  end_time time without time zone,
  all_day boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_barbershop_id IS NULL
    OR p_barber_id IS NULL
    OR p_date_from IS NULL
    OR p_date_to IS NULL
    OR p_date_to < p_date_from
    OR p_date_to - p_date_from > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DATE_RANGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbers AS barber
    JOIN public.barbershops AS barbershop
      ON barbershop.id = barber.barbershop_id
    WHERE barbershop.id = p_barbershop_id
      AND barbershop.active
      AND barber.id = p_barber_id
      AND barber.barbershop_id = p_barbershop_id
      AND barber.active
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT block.date, block.start_time, block.end_time, block.all_day
  FROM public.blocked_slots AS block
  WHERE block.barber_id = p_barber_id
    AND block.date BETWEEN p_date_from AND p_date_to
  ORDER BY block.date, block.start_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_blocked_slots(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_blocked_slots(uuid, uuid, date, date)
  TO anon, authenticated;
