CREATE OR REPLACE FUNCTION public.confirm_paid_appointment_atomic_v2(
  p_appointment_id uuid,
  p_barbershop_id uuid,
  p_payment_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_payment_id IS NULL
    OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_appointment_id IS NULL OR p_barbershop_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT appointment.*
  INTO v_appointment
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.barbershop_id = p_barbershop_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  PERFORM 1
  FROM public.barbers AS barber
  WHERE barber.id = v_appointment.barber_id
  FOR UPDATE;

  SELECT appointment.*
  INTO v_appointment
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.barbershop_id = p_barbershop_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  v_now := clock_timestamp();

  IF v_appointment.status = 'confirmed'
    AND v_appointment.deposit_status = 'paid'
    AND v_appointment.mp_payment_id = p_payment_id THEN
    RETURN 'already_confirmed';
  END IF;

  IF v_appointment.mp_payment_id IS NOT NULL
    AND v_appointment.mp_payment_id <> p_payment_id THEN
    RETURN 'payment_conflict';
  END IF;

  IF v_appointment.status = 'pending_payment'
    AND v_appointment.deposit_status = 'pending'
    AND v_appointment.expires_at IS NOT NULL
    AND v_appointment.expires_at <= v_now THEN
    RETURN 'appointment_expired';
  END IF;

  IF v_appointment.status = 'cancelled'
    AND v_appointment.cancelled_by = 'payment_expired'
    AND v_appointment.deposit_status = 'pending'
    AND v_appointment.expires_at IS NOT NULL
    AND v_appointment.expires_at <= v_now THEN
    RETURN 'appointment_expired';
  END IF;

  IF v_appointment.status <> 'pending_payment'
    OR v_appointment.deposit_status <> 'pending'
    OR v_appointment.mp_payment_id IS NOT NULL
    OR v_appointment.expires_at IS NULL THEN
    RETURN 'invalid_state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments AS other
    WHERE other.id <> v_appointment.id
      AND other.barber_id = v_appointment.barber_id
      AND other.date = v_appointment.date
      AND other.start_time < v_appointment.end_time
      AND other.end_time > v_appointment.start_time
      AND public.appointment_blocks_slot(
        other.status,
        other.deposit_status,
        other.expires_at,
        v_now
      )
  ) THEN
    RETURN 'slot_conflict';
  END IF;

  UPDATE public.appointments
  SET
    status = 'confirmed',
    deposit_status = 'paid',
    mp_payment_id = p_payment_id
  WHERE id = v_appointment.id;

  RETURN 'confirmed';
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_paid_appointment_atomic_v2(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_paid_appointment_atomic_v2(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_paid_appointment_atomic(
  p_appointment_id uuid,
  p_barbershop_id uuid,
  p_payment_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result text;
BEGIN
  v_result := public.confirm_paid_appointment_atomic_v2(
    p_appointment_id,
    p_barbershop_id,
    p_payment_id
  );

  RETURN v_result IN ('confirmed', 'already_confirmed');
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  TO service_role;
