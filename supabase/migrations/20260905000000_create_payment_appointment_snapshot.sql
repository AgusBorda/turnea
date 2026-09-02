-- P4C: create paid appointments and their financial snapshot atomically.
-- The public quote remains informational; PostgreSQL is the final authority.

CREATE OR REPLACE FUNCTION public.calculate_payment_appointment_snapshot(
  p_service_price numeric,
  p_deposit_percentage integer,
  p_processing_fee_mode text,
  p_effective_processing_rate numeric,
  p_currency text,
  p_settlement_option text
)
RETURNS TABLE(
  deposit_amount numeric,
  processing_fee_amount numeric,
  payment_total_amount numeric,
  processing_fee_rate numeric,
  processing_fee_mode text,
  payment_currency text,
  processing_fee_settlement_option text
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_deposit_amount numeric(10,2);
  v_payment_total_amount numeric(10,2);
BEGIN
  IF p_service_price IS NULL OR p_service_price <= 0
    OR p_deposit_percentage IS NULL OR p_deposit_percentage <= 0 OR p_deposit_percentage > 100
    OR p_processing_fee_mode NOT IN ('barbershop_absorbs', 'customer_covers')
    OR p_effective_processing_rate IS NULL
    OR p_effective_processing_rate < 0 OR p_effective_processing_rate > 0.15
    OR p_currency IS DISTINCT FROM 'ARS'
    OR p_settlement_option NOT IN ('instant', '10_days', '18_days', '35_days', 'custom') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYMENT_CONFIGURATION';
  END IF;

  v_deposit_amount := round(p_service_price * p_deposit_percentage / 100, 2);
  IF v_deposit_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYMENT_CONFIGURATION';
  END IF;

  IF p_processing_fee_mode = 'customer_covers' AND p_effective_processing_rate > 0 THEN
    -- Convert to cents, gross up, and ceil to the next whole cent. All operands
    -- are NUMERIC; this mirrors processing-fee.ts without binary floats.
    v_payment_total_amount := ceil(
      (v_deposit_amount * 100) / (1 - p_effective_processing_rate)
    ) / 100;
  ELSE
    v_payment_total_amount := v_deposit_amount;
  END IF;

  IF v_payment_total_amount > 99999999.99 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYMENT_CONFIGURATION';
  END IF;

  RETURN QUERY SELECT
    v_deposit_amount,
    (v_payment_total_amount - v_deposit_amount)::numeric(10,2),
    v_payment_total_amount,
    p_effective_processing_rate::numeric(7,6),
    p_processing_fee_mode,
    p_currency,
    p_settlement_option;
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_payment_appointment_snapshot(
  numeric, integer, text, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_payment_appointment_atomic(
  p_barbershop_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_date date,
  p_start_time time without time zone,
  p_client_name text,
  p_client_phone text,
  p_expires_at timestamp with time zone
)
RETURNS TABLE(
  appointment_id uuid,
  deposit_amount numeric,
  processing_fee_amount numeric,
  payment_total_amount numeric,
  processing_fee_rate numeric,
  processing_fee_mode text,
  payment_currency text,
  processing_fee_settlement_option text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment_id uuid;
  v_barber_active boolean;
  v_barbershop_active boolean;
  v_deposit_required boolean;
  v_deposit_percentage integer;
  v_mp_configured boolean;
  v_timezone text;
  v_currency text;
  v_processing_fee_mode text;
  v_effective_processing_rate numeric;
  v_settlement_option text;
  v_service_duration integer;
  v_service_active boolean;
  v_service_price numeric;
  v_end_time time without time zone;
  v_now timestamp with time zone;
  v_start_classification text;
  v_end_classification text;
  v_appointment_starts_at timestamp with time zone;
  v_appointment_ends_at timestamp with time zone;
  v_snapshot record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAYMENT_APPOINTMENT_SERVER_ONLY';
  END IF;

  IF p_client_name IS NULL OR btrim(p_client_name) = '' OR length(btrim(p_client_name)) > 120
    OR (p_client_phone IS NOT NULL AND length(btrim(p_client_phone)) > 40) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_DATA';
  END IF;

  SELECT
    barber.active,
    shop.active,
    shop.deposit_required,
    shop.deposit_percentage,
    shop.mp_configured,
    shop.timezone,
    upper(btrim(shop.currency)),
    shop.processing_fee_mode,
    shop.effective_processing_rate,
    shop.mp_settlement_option
  INTO
    v_barber_active,
    v_barbershop_active,
    v_deposit_required,
    v_deposit_percentage,
    v_mp_configured,
    v_timezone,
    v_currency,
    v_processing_fee_mode,
    v_effective_processing_rate,
    v_settlement_option
  FROM public.barbers AS barber
  JOIN public.barbershops AS shop ON shop.id = barber.barbershop_id
  WHERE barber.id = p_barber_id AND barber.barbershop_id = p_barbershop_id
  FOR UPDATE OF barber;

  IF NOT FOUND OR v_barber_active IS NOT TRUE OR v_barbershop_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BARBER';
  END IF;

  v_now := clock_timestamp();
  IF p_expires_at IS NULL OR p_expires_at <= v_now
    OR v_deposit_required IS NOT TRUE OR v_mp_configured IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVALID_PAYMENT_BOOKING';
  END IF;

  SELECT service.duration, service.active, service.price
  INTO v_service_duration, v_service_active, v_service_price
  FROM public.services AS service
  WHERE service.id = p_service_id AND service.barbershop_id = p_barbershop_id;

  IF NOT FOUND OR v_service_active IS NOT TRUE OR v_service_duration <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SERVICE';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.calculate_payment_appointment_snapshot(
    v_service_price,
    v_deposit_percentage,
    v_processing_fee_mode,
    v_effective_processing_rate,
    v_currency,
    v_settlement_option
  );

  v_end_time := p_start_time + make_interval(mins => v_service_duration);
  IF v_end_time <= p_start_time THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_APPOINTMENT_TIME';
  END IF;

  SELECT result.classification, result.resolved_at
  INTO v_start_classification, v_appointment_starts_at
  FROM public.classify_local_datetime(p_date, p_start_time, v_timezone) AS result;

  IF v_start_classification = 'nonexistent' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DST_NONEXISTENT_TIME';
  ELSIF v_start_classification = 'ambiguous' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DST_AMBIGUOUS_TIME';
  END IF;

  SELECT result.classification, result.resolved_at
  INTO v_end_classification, v_appointment_ends_at
  FROM public.classify_local_datetime(p_date, v_end_time, v_timezone) AS result;

  IF v_end_classification = 'nonexistent' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DST_NONEXISTENT_TIME';
  ELSIF v_end_classification = 'ambiguous' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DST_AMBIGUOUS_TIME';
  END IF;

  IF v_appointment_ends_at - v_appointment_starts_at
      <> make_interval(mins => v_service_duration) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DST_TRANSITION_INTERVAL';
  END IF;

  IF v_appointment_starts_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'APPOINTMENT_IN_PAST';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barber_schedules AS schedule
    WHERE schedule.barber_id = p_barber_id
      AND schedule.day_of_week = extract(dow FROM p_date)::integer
      AND schedule.is_working
      AND schedule.start_time <= p_start_time
      AND schedule.end_time >= v_end_time
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_slots AS block
    WHERE block.barber_id = p_barber_id
      AND block.date = p_date
      AND (block.all_day OR (block.start_time < v_end_time AND block.end_time > p_start_time))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments AS appointment
    WHERE appointment.barber_id = p_barber_id
      AND appointment.date = p_date
      AND appointment.start_time < v_end_time
      AND appointment.end_time > p_start_time
      AND public.appointment_blocks_slot(
        appointment.status,
        appointment.deposit_status,
        appointment.expires_at,
        v_now
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.appointments (
    barbershop_id,
    barber_id,
    service_id,
    date,
    start_time,
    end_time,
    status,
    deposit_amount,
    processing_fee_amount,
    processing_fee_rate,
    processing_fee_mode,
    payment_currency,
    processing_fee_settlement_option,
    deposit_status,
    expires_at,
    client_name,
    client_phone
  ) VALUES (
    p_barbershop_id,
    p_barber_id,
    p_service_id,
    p_date,
    p_start_time,
    v_end_time,
    'pending_payment',
    v_snapshot.deposit_amount,
    v_snapshot.processing_fee_amount,
    v_snapshot.processing_fee_rate,
    v_snapshot.processing_fee_mode,
    v_snapshot.payment_currency,
    v_snapshot.processing_fee_settlement_option,
    'pending',
    p_expires_at,
    btrim(p_client_name),
    NULLIF(btrim(p_client_phone), '')
  )
  RETURNING id INTO v_appointment_id;

  RETURN QUERY SELECT
    v_appointment_id,
    v_snapshot.deposit_amount,
    v_snapshot.processing_fee_amount,
    v_snapshot.payment_total_amount,
    v_snapshot.processing_fee_rate,
    v_snapshot.processing_fee_mode,
    v_snapshot.payment_currency,
    v_snapshot.processing_fee_settlement_option;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_payment_appointment_atomic(
  uuid, uuid, uuid, date, time without time zone, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_payment_appointment_atomic(
  uuid, uuid, uuid, date, time without time zone, text, text, timestamp with time zone
) TO service_role;