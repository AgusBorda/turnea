ALTER TABLE public.barber_schedules
  ADD CONSTRAINT barber_schedules_barber_id_day_of_week_key
  UNIQUE (barber_id, day_of_week);

CREATE OR REPLACE FUNCTION public.replace_barber_weekly_schedule(
  p_barber_id uuid,
  p_schedule jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_day integer;
  v_is_working boolean;
  v_start_time time without time zone;
  v_end_time time without time zone;
  v_seen_days integer[] := ARRAY[]::integer[];
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF p_barber_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_BARBER';
  END IF;

  PERFORM 1
  FROM public.barbers AS barber
  INNER JOIN public.barbershops AS barbershop
    ON barbershop.id = barber.barbershop_id
  WHERE barber.id = p_barber_id
    AND barbershop.owner_id = v_user_id
  FOR UPDATE OF barber;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'BARBER_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF p_schedule IS NULL
     OR jsonb_typeof(p_schedule) <> 'array'
     OR jsonb_array_length(p_schedule) <> 7 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WEEKLY_SCHEDULE';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_schedule)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'day_of_week') IS DISTINCT FROM 'number'
       OR (v_item ->> 'day_of_week') !~ '^[0-6]$'
       OR jsonb_typeof(v_item -> 'is_working') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'INVALID_SCHEDULE_DAY';
    END IF;

    v_day := (v_item ->> 'day_of_week')::integer;
    v_is_working := (v_item ->> 'is_working')::boolean;

    IF v_day = ANY(v_seen_days) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'DUPLICATE_SCHEDULE_DAY';
    END IF;

    v_seen_days := array_append(v_seen_days, v_day);

    IF v_is_working THEN
      IF jsonb_typeof(v_item -> 'start_time') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_item -> 'end_time') IS DISTINCT FROM 'string'
         OR (v_item ->> 'start_time') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$'
         OR (v_item ->> 'end_time') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'INVALID_WORKING_HOURS';
      END IF;

      v_start_time := (v_item ->> 'start_time')::time;
      v_end_time := (v_item ->> 'end_time')::time;

      IF v_start_time >= v_end_time THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'INVALID_WORKING_HOURS';
      END IF;
    ELSE
      IF (v_item ? 'start_time' AND v_item -> 'start_time' <> 'null'::jsonb)
         OR (v_item ? 'end_time' AND v_item -> 'end_time' <> 'null'::jsonb) THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'NON_WORKING_DAY_HAS_HOURS';
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.barber_schedules
  WHERE barber_id = p_barber_id;

  INSERT INTO public.barber_schedules (
    barber_id,
    day_of_week,
    start_time,
    end_time,
    is_working
  )
  SELECT
    p_barber_id,
    (day_item ->> 'day_of_week')::integer,
    CASE
      WHEN (day_item ->> 'is_working')::boolean
        THEN (day_item ->> 'start_time')::time
      ELSE TIME '09:00:00'
    END,
    CASE
      WHEN (day_item ->> 'is_working')::boolean
        THEN (day_item ->> 'end_time')::time
      ELSE TIME '20:00:00'
    END,
    (day_item ->> 'is_working')::boolean
  FROM jsonb_array_elements(p_schedule) AS schedule_items(day_item);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 7 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WEEKLY_SCHEDULE_REPLACE_FAILED';
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_barber_weekly_schedule(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.replace_barber_weekly_schedule(uuid, jsonb)
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.barber_schedules
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Owner puede gestionar schedules"
  ON public.barber_schedules;
