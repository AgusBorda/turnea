-- P4D: expose only the immutable financial snapshot needed by the public
-- Success page. Payment identifiers and private appointment data stay hidden.

DROP FUNCTION public.get_public_appointment_result(uuid, uuid);

CREATE FUNCTION public.get_public_appointment_result(
  p_appointment_id uuid,
  p_barbershop_id uuid
)
RETURNS TABLE (
  date date,
  start_time time without time zone,
  status text,
  deposit_status text,
  deposit_amount numeric,
  processing_fee_amount numeric,
  payment_total_amount numeric,
  processing_fee_mode text,
  payment_currency text,
  barber_name text,
  service_name text,
  service_price numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    appointment.date,
    appointment.start_time,
    appointment.status,
    appointment.deposit_status,
    appointment.deposit_amount,
    appointment.processing_fee_amount,
    appointment.payment_total_amount,
    appointment.processing_fee_mode,
    appointment.payment_currency,
    barber.name,
    service.name,
    service.price
  FROM public.appointments AS appointment
  JOIN public.barbers AS barber ON barber.id = appointment.barber_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  WHERE appointment.id = p_appointment_id
    AND appointment.barbershop_id = p_barbershop_id;
$function$;

REVOKE ALL ON FUNCTION public.get_public_appointment_result(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_public_appointment_result(uuid, uuid)
  TO anon, authenticated;