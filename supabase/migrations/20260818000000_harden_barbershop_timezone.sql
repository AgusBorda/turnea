UPDATE public.barbershops
SET timezone = 'America/Argentina/Buenos_Aires'
WHERE timezone IS NULL
  OR btrim(timezone) = '';

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.barbershops AS barbershop
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names AS valid_timezone
      WHERE valid_timezone.name = barbershop.timezone
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXISTING_BARBERSHOP_TIMEZONE';
  END IF;
END;
$block$;

ALTER TABLE public.barbershops
  ALTER COLUMN timezone SET DEFAULT 'America/Argentina/Buenos_Aires',
  ALTER COLUMN timezone SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_barbershop_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS valid_timezone
    WHERE valid_timezone.name = NEW.timezone
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BARBERSHOP_TIMEZONE';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_barbershop_timezone()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS validate_timezone ON public.barbershops;

CREATE TRIGGER validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.barbershops
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_barbershop_timezone();

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
  v_timezone text;
  v_service_duration integer;
  v_service_active boolean;
  v_end_time time without time zone;
  v_now timestamp with time zone;
  v_appointment_starts_at timestamp with time zone;
BEGIN
  IF p_client_name IS NULL OR btrim(p_client_name) = '' OR length(btrim(p_client_name)) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_DATA';
  END IF;
  IF p_client_phone IS NOT NULL AND length(btrim(p_client_phone)) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_DATA';
  END IF;

  SELECT b.active, bs.active, bs.deposit_required, bs.mp_configured, bs.owner_id, bs.timezone
  INTO v_barber_active, v_barbershop_active, v_deposit_required, v_mp_configured, v_owner_id, v_timezone
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

  v_appointment_starts_at := (p_date + p_start_time) AT TIME ZONE v_timezone;
  IF v_appointment_starts_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'APPOINTMENT_IN_PAST';
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

REVOKE ALL ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  TO anon, authenticated, service_role;
