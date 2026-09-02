CREATE OR REPLACE FUNCTION public.update_appointment_status_owner(
  p_appointment_id uuid,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_appointment_id IS NULL
    OR p_status IS NULL
    OR p_status NOT IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_STATUS';
  END IF;

  SELECT appointment.*
  INTO v_appointment
  FROM public.appointments AS appointment
  INNER JOIN public.barbershops AS barbershop
    ON barbershop.id = appointment.barbershop_id
  WHERE appointment.id = p_appointment_id
    AND barbershop.owner_id = auth.uid()
  FOR UPDATE OF appointment;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_appointment.status = p_status THEN
    RETURN true;
  END IF;

  IF NOT (
    (v_appointment.status IN ('pending', 'confirmed')
      AND p_status IN ('completed', 'cancelled', 'no_show'))
    OR
    (v_appointment.status = 'pending_payment' AND p_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_APPOINTMENT_STATUS_TRANSITION';
  END IF;

  UPDATE public.appointments AS appointment
  SET
    status = p_status,
    cancelled_at = CASE
      WHEN p_status = 'cancelled' THEN clock_timestamp()
      ELSE appointment.cancelled_at
    END,
    cancelled_by = CASE
      WHEN p_status = 'cancelled' THEN 'owner'
      ELSE appointment.cancelled_by
    END
  WHERE appointment.id = v_appointment.id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_appointment_status_owner(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_owner(uuid, text)
  TO authenticated;

REVOKE DELETE ON TABLE public.appointments FROM PUBLIC, anon, authenticated;
