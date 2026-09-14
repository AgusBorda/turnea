BEGIN;

-- Run as SQL Editor/postgres against DEV only. All fixture changes roll back.
DO $test$
DECLARE
  v_shop_id uuid;
  v_barber_id uuid := gen_random_uuid();
  v_service_id uuid := gen_random_uuid();
  v_date date := current_date + 60;
  v_expires_at timestamptz := clock_timestamp() + interval '15 minutes';
  v_token bytea := decode(repeat('a1', 32), 'hex');
  v_other_token bytea := decode(repeat('b2', 32), 'hex');
  v_fp bytea := decode(repeat('c3', 32), 'hex');
  v_first record;
  v_repeat record;
  v_claim record;
  v_new_claim record;
  v_last_claim record;
  v_expiring record;
  v_legacy record;
  v_result text;
  v_appointments_before bigint;
BEGIN
  SELECT id INTO v_shop_id FROM public.barbershops
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_shop_id IS NULL THEN RAISE EXCEPTION 'P6B_REQUIRES_DEV_BARBERSHOP'; END IF;

  UPDATE public.barbershops
  SET active = true, deposit_required = true, mp_configured = true,
      deposit_percentage = 10, currency = 'ARS',
      processing_fee_mode = 'barbershop_absorbs'
  WHERE id = v_shop_id;

  INSERT INTO public.barbers (id, barbershop_id, name, active, sort_order)
  VALUES (v_barber_id, v_shop_id, 'P6B rollback-only barber', true,
    (SELECT COALESCE(max(sort_order), -1) + 1 FROM public.barbers WHERE barbershop_id = v_shop_id));
  INSERT INTO public.barber_schedules
    (barber_id, day_of_week, start_time, end_time, is_working)
  SELECT v_barber_id, day_number, time '09:00', time '20:00', true
  FROM generate_series(0, 6) AS day_number;
  INSERT INTO public.services (id, barbershop_id, name, duration, price, active, sort_order)
  VALUES (v_service_id, v_shop_id, 'P6B rollback-only service', 30, 10000, true,
    (SELECT COALESCE(max(sort_order), -1) + 1 FROM public.services WHERE barbershop_id = v_shop_id));

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT * INTO STRICT v_first FROM public.get_or_create_checkout_intent_v1(
    v_token, v_fp, 1, v_shop_id, v_barber_id, v_service_id,
    v_date, time '10:00', 'P6B Customer', '+541112345678', v_expires_at, '123456'
  );
  IF v_first.intent_status <> 'reserved' OR v_first.preference_phase <> 'no_post'
    OR v_first.appointment_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.appointments AS a
      WHERE a.id = v_first.appointment_id AND a.status = 'pending_payment'
        AND a.deposit_status = 'pending' AND a.expires_at = v_first.expires_at)
    OR (SELECT count(*) FROM public.checkout_intents AS i
      WHERE i.appointment_id = v_first.appointment_id) <> 1 THEN
    RAISE EXCEPTION 'P6B_ATOMIC_RESERVATION_FAILED';
  END IF;

  SELECT * INTO STRICT v_repeat FROM public.get_or_create_checkout_intent_v1(
    v_token, v_fp, 1, v_shop_id, v_barber_id, v_service_id,
    v_date, time '10:00', 'P6B Customer', '+541112345678', v_expires_at, '123456'
  );
  IF v_repeat.intent_id <> v_first.intent_id
    OR v_repeat.appointment_id <> v_first.appointment_id THEN
    RAISE EXCEPTION 'P6B_RETRY_CREATED_ANOTHER_APPOINTMENT';
  END IF;

  SELECT count(*) INTO v_appointments_before FROM public.appointments;
  BEGIN
    PERFORM public.get_or_create_checkout_intent_v1(
      v_token, decode(repeat('d4', 32), 'hex'), 1,
      v_shop_id, v_barber_id, v_service_id,
      v_date, time '10:00', 'Different Customer', '+541112345678', v_expires_at, '123456'
    );
    RAISE EXCEPTION 'P6B_MUTATED_PAYLOAD_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CHECKOUT_INTENT_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_or_create_checkout_intent_v1(
      v_token, v_fp, 1, v_shop_id, v_barber_id, v_service_id,
      v_date, time '10:00', 'P6B Customer', '+541112345678', v_expires_at, '999999'
    );
    RAISE EXCEPTION 'P6B_SELLER_DRIFT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CHECKOUT_SELLER_CHANGED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_or_create_checkout_intent_v1(
      v_other_token, v_fp, 1, v_shop_id, v_barber_id, v_service_id,
      v_date, time '10:00', 'P6B Customer', '+541112345678', v_expires_at, '123456'
    );
    RAISE EXCEPTION 'P6B_SECOND_TOKEN_RESERVED_SAME_SLOT';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SLOT_CONFLICT' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.appointments) <> v_appointments_before THEN
    RAISE EXCEPTION 'P6B_REJECTED_ATTEMPT_MUTATED_APPOINTMENTS';
  END IF;

  SELECT * INTO STRICT v_claim FROM public.claim_checkout_preference_v1(v_first.intent_id);
  IF v_claim.result <> 'claimed' OR v_claim.claim_id IS NULL THEN
    RAISE EXCEPTION 'P6B_CLAIM_FAILED';
  END IF;
  IF (SELECT result FROM public.claim_checkout_preference_v1(v_first.intent_id)) <> 'busy' THEN
    RAISE EXCEPTION 'P6B_DOUBLE_CLAIM_ALLOWED';
  END IF;
  IF public.mark_checkout_preference_post_possible_v1(v_first.intent_id, gen_random_uuid()) <> 'not_marked' THEN
    RAISE EXCEPTION 'P6B_WRONG_CLAIM_MARKED';
  END IF;

  -- Simulate a worker whose no-POST lease expired; the stale claim cannot mark.
  UPDATE public.checkout_intents SET preference_claimed_at = clock_timestamp() - interval '31 seconds'
  WHERE id = v_first.intent_id;
  SELECT * INTO STRICT v_new_claim FROM public.claim_checkout_preference_v1(v_first.intent_id);
  IF v_new_claim.result <> 'claimed' OR v_new_claim.claim_id = v_claim.claim_id THEN
    RAISE EXCEPTION 'P6B_STALE_CLAIM_RECOVERY_FAILED';
  END IF;
  IF public.mark_checkout_preference_post_possible_v1(v_first.intent_id, v_claim.claim_id) <> 'not_marked' THEN
    RAISE EXCEPTION 'P6B_STALE_CLAIM_MARKED';
  END IF;
  IF public.release_checkout_preference_claim_v1(v_first.intent_id, v_new_claim.claim_id) <> 'released' THEN
    RAISE EXCEPTION 'P6B_NO_POST_RELEASE_FAILED';
  END IF;
  SELECT * INTO STRICT v_last_claim FROM public.claim_checkout_preference_v1(v_first.intent_id);
  IF v_last_claim.result <> 'claimed' THEN RAISE EXCEPTION 'P6B_RECLAIM_FAILED'; END IF;
  IF public.mark_checkout_preference_post_possible_v1(v_first.intent_id, v_last_claim.claim_id) <> 'marked'
    THEN RAISE EXCEPTION 'P6B_POST_MARK_FAILED'; END IF;
  IF public.release_checkout_preference_claim_v1(v_first.intent_id, v_last_claim.claim_id) <> 'not_released'
    THEN RAISE EXCEPTION 'P6B_POST_RELEASED'; END IF;
  IF (SELECT result FROM public.claim_checkout_preference_v1(v_first.intent_id)) <> 'post_possible' THEN
    RAISE EXCEPTION 'P6B_POST_BOUNDARY_UNSAFE';
  END IF;

  v_result := public.mark_checkout_preference_unknown_v1(v_first.intent_id, v_last_claim.claim_id);
  IF v_result <> 'unknown' THEN RAISE EXCEPTION 'P6B_UNKNOWN_FAILED: %', v_result; END IF;
  v_result := public.complete_checkout_preference_v1(
    v_first.intent_id, NULL, 'P6B_PREF_1', 'https://www.mercadopago.com/checkout/p6b-test'
  );
  IF v_result <> 'ready' THEN RAISE EXCEPTION 'P6B_COMPLETE_FAILED: %', v_result; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.appointments AS a
      WHERE a.id = v_first.appointment_id AND a.mp_preference_id = 'P6B_PREF_1') THEN
    RAISE EXCEPTION 'P6B_PREFERENCE_FINALIZATION_FAILED';
  END IF;
  IF public.complete_checkout_preference_v1(
      v_first.intent_id, NULL, 'P6B_PREF_2', 'https://www.mercadopago.com/checkout/p6b-test-2'
    ) <> 'preference_conflict' THEN RAISE EXCEPTION 'P6B_PREFERENCE_OVERWRITTEN'; END IF;

  -- A separate appointment uses the old RPC and remains legacy/no intent.
  SELECT * INTO STRICT v_legacy FROM public.create_payment_appointment_atomic(
    v_shop_id, v_barber_id, v_service_id, v_date, time '11:00',
    'P6B Legacy', '+541112345678', v_expires_at
  );
  IF EXISTS (SELECT 1 FROM public.checkout_intents WHERE appointment_id = v_legacy.appointment_id) THEN
    RAISE EXCEPTION 'P6B_LEGACY_WAS_BACKFILLED';
  END IF;

  SELECT * INTO STRICT v_expiring FROM public.get_or_create_checkout_intent_v1(
    v_other_token, v_fp, 1, v_shop_id, v_barber_id, v_service_id,
    v_date, time '12:00', 'P6B Expiring', '+541112345678', v_expires_at, '123456'
  );
  UPDATE public.appointments SET expires_at = clock_timestamp() - interval '1 minute'
  WHERE id = v_expiring.appointment_id;
  UPDATE public.checkout_intents
  SET created_at = clock_timestamp() - interval '20 minutes',
      expires_at = clock_timestamp() - interval '1 minute'
  WHERE id = v_expiring.intent_id;
  SELECT result INTO v_result FROM public.claim_checkout_preference_v1(v_expiring.intent_id);
  IF v_result <> 'expired' THEN RAISE EXCEPTION 'P6B_EXPIRED_CLAIM_RESULT: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM public.checkout_intents AS i
      WHERE i.id = v_expiring.intent_id AND (i.status <> 'expired' OR i.preference_claim_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'P6B_EXPIRED_INTENT_CLAIMED';
  END IF;

  IF has_table_privilege('anon', 'public.checkout_intents', 'SELECT')
    OR has_table_privilege('authenticated', 'public.checkout_intents', 'SELECT')
    OR has_function_privilege('anon', 'public.claim_checkout_preference_v1(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_checkout_preference_v1(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P6B_PRIVATE_GRANTS_FAILED';
  END IF;

  RAISE NOTICE 'P6B_CHECKOUT_INTENT_TEST_PASS';
END;
$test$;

ROLLBACK;
