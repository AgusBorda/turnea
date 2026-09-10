BEGIN;

DO $block$
DECLARE
  v_barbershop_id uuid;
  v_owner_id uuid;
  v_barber_id uuid;
  v_service_id uuid;
  v_date date;
  v_start_time time without time zone;
  v_end_time time without time zone;
  v_appointment_id uuid;
  v_before_count integer;
BEGIN
  SELECT
    shop.id,
    shop.owner_id,
    barber.id,
    service.id,
    candidate.test_date,
    schedule.start_time,
    schedule.start_time + make_interval(mins => service.duration)
  INTO STRICT
    v_barbershop_id,
    v_owner_id,
    v_barber_id,
    v_service_id,
    v_date,
    v_start_time,
    v_end_time
  FROM public.barbershops AS shop
  JOIN public.barbers AS barber
    ON barber.barbershop_id = shop.id
   AND barber.active
  JOIN public.services AS service
    ON service.barbershop_id = shop.id
   AND service.active
   AND service.duration > 0
  JOIN public.barber_schedules AS schedule
    ON schedule.barber_id = barber.id
   AND schedule.is_working
   AND schedule.start_time + make_interval(mins => service.duration) <= schedule.end_time
  CROSS JOIN LATERAL (
    SELECT day_value::date AS test_date
    FROM generate_series(current_date + 2, current_date + 62, interval '1 day') AS day_value
    WHERE extract(dow FROM day_value)::integer = schedule.day_of_week
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_slots AS block
        WHERE block.barber_id = barber.id
          AND block.date = day_value::date
          AND (
            block.all_day
            OR (
              block.start_time < schedule.start_time + make_interval(mins => service.duration)
              AND block.end_time > schedule.start_time
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.appointments AS appointment
        WHERE appointment.barber_id = barber.id
          AND appointment.date = day_value::date
          AND appointment.start_time < schedule.start_time + make_interval(mins => service.duration)
          AND appointment.end_time > schedule.start_time
          AND public.appointment_blocks_slot(
            appointment.status,
            appointment.deposit_status,
            appointment.expires_at,
            clock_timestamp()
          )
      )
    ORDER BY day_value
    LIMIT 1
  ) AS candidate
  WHERE shop.active
  ORDER BY shop.created_at, barber.sort_order, service.sort_order
  LIMIT 1;

  SELECT count(*)
  INTO v_before_count
  FROM public.appointments
  WHERE barber_id = v_barber_id
    AND date = v_date
    AND start_time = v_start_time;

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  UPDATE public.barbershops
  SET deposit_required = true,
      mp_configured = false
  WHERE id = v_barbershop_id;

  BEGIN
    PERFORM public.create_appointment_atomic(
      v_barbershop_id, v_barber_id, v_service_id, v_date, v_start_time,
      'P5D public disconnected rejection'
    );
    RAISE EXCEPTION 'P5D_DISCONNECTED_PUBLIC_BOOKING_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'PAYMENT_REQUIRED' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.barbershops
  SET mp_configured = true
  WHERE id = v_barbershop_id;

  BEGIN
    PERFORM public.create_appointment_atomic(
      v_barbershop_id, v_barber_id, v_service_id, v_date, v_start_time,
      'P5D public connected rejection'
    );
    RAISE EXCEPTION 'P5D_CONNECTED_PUBLIC_DIRECT_BOOKING_ACCEPTED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'PAYMENT_REQUIRED' THEN
        RAISE;
      END IF;
  END;

  IF (
    SELECT count(*)
    FROM public.appointments
    WHERE barber_id = v_barber_id
      AND date = v_date
      AND start_time = v_start_time
  ) <> v_before_count THEN
    RAISE EXCEPTION 'P5D_REJECTED_BOOKING_MUTATED_APPOINTMENTS';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  SELECT public.create_appointment_atomic(
    v_barbershop_id, v_barber_id, v_service_id, v_date, v_start_time,
    'P5D owner manual booking'
  ) INTO v_appointment_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = v_appointment_id
      AND status = 'confirmed'
      AND deposit_status = 'none'
  ) THEN
    RAISE EXCEPTION 'P5D_OWNER_MANUAL_BOOKING_CHANGED';
  END IF;
  DELETE FROM public.appointments WHERE id = v_appointment_id;

  UPDATE public.barbershops
  SET deposit_required = false,
      mp_configured = false
  WHERE id = v_barbershop_id;

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT public.create_appointment_atomic(
    v_barbershop_id, v_barber_id, v_service_id, v_date, v_start_time,
    'P5D public no-deposit booking'
  ) INTO v_appointment_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = v_appointment_id
      AND status = 'confirmed'
      AND deposit_status = 'none'
  ) THEN
    RAISE EXCEPTION 'P5D_NO_DEPOSIT_FLOW_CHANGED';
  END IF;
  DELETE FROM public.appointments WHERE id = v_appointment_id;
END;
$block$;

ROLLBACK;
