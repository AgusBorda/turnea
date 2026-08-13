CREATE OR REPLACE FUNCTION public.appointment_blocks_slot(
  p_status text,
  p_deposit_status text,
  p_expires_at timestamp with time zone,
  p_now timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT
    p_status IN ('pending', 'confirmed')
    OR (
      p_status = 'pending_payment'
      AND p_deposit_status = 'pending'
      AND p_expires_at > p_now
    );
$function$;

CREATE OR REPLACE FUNCTION public.create_appointment_atomic(
  p_barbershop_id uuid, p_barber_id uuid, p_service_id uuid, p_date date,
  p_start_time time without time zone, p_client_name text,
  p_client_phone text DEFAULT NULL, p_payment_pending boolean DEFAULT false,
  p_deposit_amount numeric DEFAULT 0,
  p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment_id uuid;
  v_barber_active boolean;
  v_barbershop_active boolean;
  v_deposit_required boolean;
  v_mp_configured boolean;
  v_owner_id uuid;
  v_service_duration integer;
  v_service_active boolean;
  v_end_time time without time zone;
  v_now timestamp with time zone;
BEGIN
  IF p_client_name IS NULL OR btrim(p_client_name) = '' OR length(btrim(p_client_name)) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_DATA';
  END IF;
  IF p_client_phone IS NOT NULL AND length(btrim(p_client_phone)) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_DATA';
  END IF;

  SELECT b.active, bs.active, bs.deposit_required, bs.mp_configured, bs.owner_id
  INTO v_barber_active, v_barbershop_active, v_deposit_required, v_mp_configured, v_owner_id
  FROM public.barbers AS b
  JOIN public.barbershops AS bs ON bs.id = b.barbershop_id
  WHERE b.id = p_barber_id AND b.barbershop_id = p_barbershop_id
  FOR UPDATE OF b;

  IF NOT FOUND OR v_barber_active IS NOT TRUE OR v_barbershop_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BARBER';
  END IF;
  v_now := clock_timestamp();

  SELECT s.duration, s.active INTO v_service_duration, v_service_active
  FROM public.services AS s
  WHERE s.id = p_service_id AND s.barbershop_id = p_barbershop_id;
  IF NOT FOUND OR v_service_active IS NOT TRUE OR v_service_duration <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SERVICE';
  END IF;

  v_end_time := p_start_time + make_interval(mins => v_service_duration);
  IF v_end_time <= p_start_time THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_TIME';
  END IF;

  IF p_payment_pending THEN
    IF auth.role() IS DISTINCT FROM 'service_role' OR p_expires_at IS NULL
      OR p_expires_at <= v_now OR p_deposit_amount <= 0
      OR v_deposit_required IS NOT TRUE OR v_mp_configured IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVALID_PAYMENT_BOOKING';
    END IF;
  ELSIF v_deposit_required AND v_mp_configured AND auth.uid() IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAYMENT_REQUIRED';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL
    AND auth.uid() IS DISTINCT FROM v_owner_id
    AND v_deposit_required AND v_mp_configured THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAYMENT_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barber_schedules AS schedule
    WHERE schedule.barber_id = p_barber_id
      AND schedule.day_of_week = extract(dow FROM p_date)::integer
      AND schedule.is_working AND schedule.start_time <= p_start_time
      AND schedule.end_time >= v_end_time
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_slots AS block
    WHERE block.barber_id = p_barber_id AND block.date = p_date
      AND (block.all_day OR (block.start_time < v_end_time AND block.end_time > p_start_time))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments AS appointment
    WHERE appointment.barber_id = p_barber_id AND appointment.date = p_date
      AND appointment.start_time < v_end_time AND appointment.end_time > p_start_time
      AND public.appointment_blocks_slot(
        appointment.status, appointment.deposit_status, appointment.expires_at, v_now
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.appointments (
    barbershop_id, barber_id, service_id, date, start_time, end_time,
    status, deposit_amount, deposit_status, expires_at, client_name, client_phone
  ) VALUES (
    p_barbershop_id, p_barber_id, p_service_id, p_date, p_start_time, v_end_time,
    CASE WHEN p_payment_pending THEN 'pending_payment' ELSE 'confirmed' END,
    CASE WHEN p_payment_pending THEN p_deposit_amount ELSE 0 END,
    CASE WHEN p_payment_pending THEN 'pending' ELSE 'none' END,
    CASE WHEN p_payment_pending THEN p_expires_at ELSE NULL END,
    btrim(p_client_name), NULLIF(btrim(p_client_phone), '')
  ) RETURNING id INTO v_appointment_id;
  RETURN v_appointment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_paid_appointment_atomic(
  p_appointment_id uuid, p_barbershop_id uuid, p_payment_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_now timestamp with time zone;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  SELECT appointment.* INTO v_appointment FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id AND appointment.barbershop_id = p_barbershop_id;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1 FROM public.barbers WHERE id = v_appointment.barber_id FOR UPDATE;
  SELECT appointment.* INTO v_appointment FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id AND appointment.barbershop_id = p_barbershop_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();

  IF v_appointment.status = 'confirmed' AND v_appointment.deposit_status = 'paid'
    AND v_appointment.mp_payment_id = p_payment_id THEN
    RETURN true;
  END IF;
  IF v_appointment.status <> 'pending_payment' OR v_appointment.deposit_status <> 'pending'
    OR v_appointment.mp_payment_id IS NOT NULL OR v_appointment.expires_at IS NULL
    OR v_appointment.expires_at <= v_now THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments AS other
    WHERE other.id <> v_appointment.id AND other.barber_id = v_appointment.barber_id
      AND other.date = v_appointment.date AND other.start_time < v_appointment.end_time
      AND other.end_time > v_appointment.start_time
      AND public.appointment_blocks_slot(other.status, other.deposit_status, other.expires_at, v_now)
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.appointments SET status = 'confirmed', deposit_status = 'paid', mp_payment_id = p_payment_id
  WHERE id = v_appointment.id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_busy_slots(
  p_barbershop_id uuid, p_barber_id uuid, p_date_from date, p_date_to date
)
RETURNS TABLE (date date, start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_barbershop_id IS NULL OR p_barber_id IS NULL OR p_date_from IS NULL OR p_date_to IS NULL
    OR p_date_to < p_date_from OR p_date_to - p_date_from > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DATE_RANGE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.barbers AS b
    JOIN public.barbershops AS bs ON bs.id = b.barbershop_id
    WHERE bs.id = p_barbershop_id AND bs.active
      AND b.id = p_barber_id AND b.barbershop_id = p_barbershop_id AND b.active
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.date, a.start_time, a.end_time
  FROM public.appointments AS a
  WHERE a.barbershop_id = p_barbershop_id AND a.barber_id = p_barber_id
    AND a.date BETWEEN p_date_from AND p_date_to
    AND public.appointment_blocks_slot(a.status, a.deposit_status, a.expires_at, clock_timestamp())
  ORDER BY a.date, a.start_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_appointment_payment_status(
  p_appointment_id uuid, p_barbershop_id uuid
)
RETURNS TABLE (status text, deposit_status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT a.status, a.deposit_status
  FROM public.appointments AS a
  WHERE a.id = p_appointment_id AND a.barbershop_id = p_barbershop_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_appointment_result(
  p_appointment_id uuid, p_barbershop_id uuid
)
RETURNS TABLE (
  date date, start_time time without time zone, status text, deposit_status text,
  deposit_amount numeric, barber_name text, service_name text, service_price numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT a.date, a.start_time, a.status, a.deposit_status, a.deposit_amount,
    b.name, s.name, s.price
  FROM public.appointments AS a
  JOIN public.barbers AS b ON b.id = a.barber_id
  LEFT JOIN public.services AS s ON s.id = a.service_id
  WHERE a.id = p_appointment_id AND a.barbershop_id = p_barbershop_id;
$function$;

REVOKE ALL ON FUNCTION public.appointment_blocks_slot(text, text, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_public_busy_slots(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, uuid, date, date) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_appointment_payment_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_payment_status(uuid, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_appointment_result(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_result(uuid, uuid) TO anon, authenticated;
