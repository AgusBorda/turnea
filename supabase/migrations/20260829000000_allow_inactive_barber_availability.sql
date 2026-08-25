-- Owners may prepare blocked slots and vacations before reactivating a barber.
-- Public booking and appointment creation continue to require active barbers.
CREATE OR REPLACE FUNCTION public.create_barber_blocked_slot(
  p_barber_id uuid,
  p_date date,
  p_all_day boolean,
  p_start_time time without time zone DEFAULT NULL,
  p_end_time time without time zone DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_blocked_slot_id uuid;
  v_timezone text;
  v_today date;
  v_now timestamp with time zone := clock_timestamp();
  v_reason text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'BARBER_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  SELECT barbershop.timezone
  INTO v_timezone
  FROM public.barbers AS barber
  JOIN public.barbershops AS barbershop
    ON barbershop.id = barber.barbershop_id
  WHERE barber.id = p_barber_id
    AND barbershop.active
    AND barbershop.owner_id = auth.uid()
  FOR UPDATE OF barber;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BARBER_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  IF p_all_day IS NULL OR p_date IS NULL OR NOT (
    (p_all_day = true AND p_start_time IS NULL AND p_end_time IS NULL)
    OR
    (
      p_all_day = false
      AND p_start_time IS NOT NULL
      AND p_end_time IS NOT NULL
      AND p_start_time < p_end_time
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BLOCKED_SLOT_INVALID_RANGE';
  END IF;

  v_today := (v_now AT TIME ZONE v_timezone)::date;
  IF p_date < v_today THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BLOCKED_SLOT_IN_PAST';
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BLOCKED_SLOT_INVALID_REASON';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_slots AS block
    WHERE block.barber_id = p_barber_id
      AND block.date = p_date
      AND (
        block.all_day
        OR p_all_day
        OR (p_start_time < block.end_time AND p_end_time > block.start_time)
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BLOCKED_SLOT_OVERLAP';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments AS appointment
    WHERE appointment.barber_id = p_barber_id
      AND appointment.date = p_date
      AND public.appointment_blocks_slot(
        appointment.status,
        appointment.deposit_status,
        appointment.expires_at,
        v_now
      )
      AND (
        p_all_day
        OR (
          appointment.start_time < p_end_time
          AND appointment.end_time > p_start_time
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BLOCK_CONFLICTS_WITH_APPOINTMENTS';
  END IF;

  INSERT INTO public.blocked_slots (
    barber_id,
    date,
    start_time,
    end_time,
    all_day,
    reason
  )
  VALUES (
    p_barber_id,
    p_date,
    p_start_time,
    p_end_time,
    p_all_day,
    v_reason
  )
  RETURNING id INTO v_blocked_slot_id;

  RETURN v_blocked_slot_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_barber_vacation(
  p_barber_id uuid,
  p_date_from date,
  p_date_to date,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timezone text;
  v_today date;
  v_now timestamp with time zone := clock_timestamp();
  v_reason text;
  v_inserted_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'BARBER_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  SELECT barbershop.timezone
  INTO v_timezone
  FROM public.barbers AS barber
  JOIN public.barbershops AS barbershop
    ON barbershop.id = barber.barbershop_id
  WHERE barber.id = p_barber_id
    AND barbershop.active
    AND barbershop.owner_id = auth.uid()
  FOR UPDATE OF barber;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BARBER_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to < p_date_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'VACATION_RANGE_INVALID';
  END IF;

  IF p_date_to - p_date_from > 89 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'VACATION_RANGE_TOO_LARGE';
  END IF;

  v_today := (v_now AT TIME ZONE v_timezone)::date;
  IF p_date_from < v_today THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BLOCKED_SLOT_IN_PAST';
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BLOCKED_SLOT_INVALID_REASON';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_slots AS block
    WHERE block.barber_id = p_barber_id
      AND block.date BETWEEN p_date_from AND p_date_to
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BLOCKED_SLOT_OVERLAP';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments AS appointment
    WHERE appointment.barber_id = p_barber_id
      AND appointment.date BETWEEN p_date_from AND p_date_to
      AND public.appointment_blocks_slot(
        appointment.status,
        appointment.deposit_status,
        appointment.expires_at,
        v_now
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BLOCK_CONFLICTS_WITH_APPOINTMENTS';
  END IF;

  INSERT INTO public.blocked_slots (
    barber_id,
    date,
    start_time,
    end_time,
    all_day,
    reason
  )
  SELECT
    p_barber_id,
    p_date_from + day_offset,
    NULL,
    NULL,
    true,
    v_reason
  FROM generate_series(0, p_date_to - p_date_from) AS day_offset;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_barber_blocked_slot(
  uuid, date, boolean, time without time zone, time without time zone, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_barber_blocked_slot(
  uuid, date, boolean, time without time zone, time without time zone, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_barber_vacation(uuid, date, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_barber_vacation(uuid, date, date, text)
  TO authenticated;
