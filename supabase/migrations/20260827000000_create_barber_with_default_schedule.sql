CREATE OR REPLACE FUNCTION public.create_barber_with_default_schedule(
  p_barbershop_id uuid,
  p_name text,
  p_bio text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  name text,
  photo_url text,
  bio text,
  sort_order integer,
  active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := NULLIF(btrim(p_name), '');
  v_bio text := NULLIF(btrim(p_bio), '');
  v_sort_order integer;
  v_barber public.barbers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF p_barbershop_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_BARBERSHOP';
  END IF;

  IF v_name IS NULL OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_BARBER_NAME';
  END IF;

  IF v_bio IS NOT NULL AND char_length(v_bio) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_BARBER_BIO';
  END IF;

  PERFORM 1
  FROM public.barbershops AS barbershop
  WHERE barbershop.id = p_barbershop_id
    AND barbershop.owner_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'BARBERSHOP_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT COALESCE(MAX(barber.sort_order), -1) + 1
  INTO v_sort_order
  FROM public.barbers AS barber
  WHERE barber.barbershop_id = p_barbershop_id;

  INSERT INTO public.barbers (
    barbershop_id,
    name,
    bio,
    sort_order,
    active
  )
  VALUES (
    p_barbershop_id,
    v_name,
    v_bio,
    v_sort_order,
    TRUE
  )
  RETURNING * INTO v_barber;

  INSERT INTO public.barber_schedules (
    barber_id,
    day_of_week,
    start_time,
    end_time,
    is_working
  )
  SELECT
    v_barber.id,
    day_of_week,
    TIME '09:00:00',
    TIME '20:00:00',
    TRUE
  FROM generate_series(1, 6) AS days(day_of_week);

  RETURN QUERY
  SELECT
    v_barber.id,
    v_barber.barbershop_id,
    v_barber.name,
    v_barber.photo_url,
    v_barber.bio,
    v_barber.sort_order,
    v_barber.active,
    v_barber.created_at,
    v_barber.updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_barber_with_default_schedule(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_barber_with_default_schedule(uuid, text, text)
  TO authenticated;
