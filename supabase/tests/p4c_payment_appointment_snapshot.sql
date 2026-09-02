BEGIN;

DO $test$
DECLARE
  v_snapshot record;
BEGIN
  SELECT * INTO v_snapshot
  FROM public.calculate_payment_appointment_snapshot(15000, 10, 'customer_covers', 0.04, 'ARS', 'instant');
  IF v_snapshot.deposit_amount <> 1500.00
    OR v_snapshot.processing_fee_amount <> 62.50
    OR v_snapshot.payment_total_amount <> 1562.50 THEN
    RAISE EXCEPTION 'customer_covers 4%% snapshot mismatch: %', row_to_json(v_snapshot);
  END IF;

  SELECT * INTO v_snapshot
  FROM public.calculate_payment_appointment_snapshot(15000, 10, 'barbershop_absorbs', 0.15, 'ARS', 'instant');
  IF v_snapshot.deposit_amount <> 1500.00
    OR v_snapshot.processing_fee_amount <> 0.00
    OR v_snapshot.payment_total_amount <> 1500.00 THEN
    RAISE EXCEPTION 'absorbed snapshot mismatch: %', row_to_json(v_snapshot);
  END IF;

  SELECT * INTO v_snapshot
  FROM public.calculate_payment_appointment_snapshot(15000, 10, 'customer_covers', 0, 'ARS', 'custom');
  IF v_snapshot.processing_fee_amount <> 0.00 OR v_snapshot.payment_total_amount <> 1500.00 THEN
    RAISE EXCEPTION 'zero-rate snapshot mismatch: %', row_to_json(v_snapshot);
  END IF;

  SELECT * INTO v_snapshot
  FROM public.calculate_payment_appointment_snapshot(15000, 10, 'customer_covers', 0.15, 'ARS', 'custom');
  IF v_snapshot.payment_total_amount <> 1764.71 THEN
    RAISE EXCEPTION 'maximum-rate snapshot mismatch: %', row_to_json(v_snapshot);
  END IF;

  BEGIN
    PERFORM * FROM public.calculate_payment_appointment_snapshot(15000, 10, 'customer_covers', 0.150001, 'ARS', 'custom');
    RAISE EXCEPTION 'invalid rate was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_CONFIGURATION' THEN RAISE; END IF;
  END;

  IF has_function_privilege('anon', 'public.create_payment_appointment_atomic(uuid,uuid,uuid,date,time without time zone,text,text,timestamp with time zone)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.create_payment_appointment_atomic(uuid,uuid,uuid,date,time without time zone,text,text,timestamp with time zone)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.create_payment_appointment_atomic(uuid,uuid,uuid,date,time without time zone,text,text,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected create_payment_appointment_atomic grants';
  END IF;
END;
$test$;

DO $integration$
DECLARE
  v_barbershop_id uuid;
  v_barber_id uuid := gen_random_uuid();
  v_service_id uuid := gen_random_uuid();
  v_result record;
  v_stored record;
BEGIN
  SELECT id INTO v_barbershop_id
  FROM public.barbershops
  ORDER BY created_at
  LIMIT 1;

  IF v_barbershop_id IS NULL THEN
    RAISE EXCEPTION 'P4C integration fixture requires one DEV barbershop';
  END IF;

  INSERT INTO public.barbers (id, barbershop_id, name, active, sort_order)
  VALUES (v_barber_id, v_barbershop_id, 'P4C rollback fixture', true, 999999);

  INSERT INTO public.barber_schedules (
    barber_id, day_of_week, start_time, end_time, is_working
  ) VALUES (
    v_barber_id,
    extract(dow FROM DATE '2099-01-05')::integer,
    TIME '09:00',
    TIME '20:00',
    true
  );

  INSERT INTO public.services (
    id, barbershop_id, name, duration, price, active, sort_order
  ) VALUES (
    v_service_id, v_barbershop_id, 'P4C rollback service', 30, 15000.00, true, 999999
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    UPDATE public.barbershops
    SET deposit_required = false, mp_configured = true
    WHERE id = v_barbershop_id;

    PERFORM * FROM public.create_payment_appointment_atomic(
      v_barbershop_id, v_barber_id, v_service_id,
      DATE '2099-01-05', TIME '10:00',
      'P4C rollback client', '1100000000', clock_timestamp() + interval '15 minutes'
    );
    RAISE EXCEPTION 'payment appointment without required deposit was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'INVALID_PAYMENT_BOOKING' THEN RAISE; END IF;
  END;

  UPDATE public.barbershops
  SET
    active = true,
    deposit_required = true,
    deposit_percentage = 10,
    mp_configured = true,
    currency = 'ARS',
    processing_fee_mode = 'customer_covers',
    effective_processing_rate = 0.04,
    mp_settlement_option = 'instant'
  WHERE id = v_barbershop_id;

  SELECT * INTO v_result
  FROM public.create_payment_appointment_atomic(
    v_barbershop_id, v_barber_id, v_service_id,
    DATE '2099-01-05', TIME '10:00',
    'P4C rollback client', '1100000000', clock_timestamp() + interval '15 minutes'
  );

  SELECT
    status,
    deposit_status,
    deposit_amount,
    processing_fee_amount,
    payment_total_amount,
    processing_fee_rate,
    processing_fee_mode,
    payment_currency,
    processing_fee_settlement_option
  INTO STRICT v_stored
  FROM public.appointments
  WHERE id = v_result.appointment_id;

  IF v_result.deposit_amount <> 1500.00
    OR v_result.processing_fee_amount <> 62.50
    OR v_result.payment_total_amount <> 1562.50
    OR v_stored.status <> 'pending_payment'
    OR v_stored.deposit_status <> 'pending'
    OR v_stored.payment_total_amount <> 1562.50 THEN
    RAISE EXCEPTION 'P4C atomic snapshot mismatch';
  END IF;

  BEGIN
    PERFORM * FROM public.create_payment_appointment_atomic(
      v_barbershop_id, v_barber_id, v_service_id,
      DATE '2099-01-05', TIME '10:00',
      'P4C overlap client', '1100000001', clock_timestamp() + interval '15 minutes'
    );
    RAISE EXCEPTION 'overlapping payment appointment was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SLOT_CONFLICT' THEN RAISE; END IF;
  END;
END;
$integration$;

ROLLBACK;
