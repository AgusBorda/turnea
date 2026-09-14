-- Run only on Turnea DEV. All fixtures and changed rows are rolled back.
BEGIN;

DO $test$
DECLARE
  v_shop uuid;
  v_owner uuid;
  v_appointment uuid;
  v_legacy uuid := gen_random_uuid();
  v_v2 uuid := gen_random_uuid();
  v_failed uuid := gen_random_uuid();
  v_historical uuid := gen_random_uuid();
  v_claim record;
  v_claim_b record;
  v_key uuid;
  v_legacy_key uuid;
  v_old_claim_id uuid;
  v_new_claim_id uuid;
  v_first_requested_at timestamptz;
  v_result text;
BEGIN
  IF has_function_privilege('anon', 'public.claim_payment_reconciliation_refund_v2(uuid)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.claim_payment_reconciliation_refund_v2(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.claim_payment_reconciliation_refund_v2(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.mark_payment_reconciliation_refund_post_possible(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.release_payment_reconciliation_refund_claim(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.mark_payment_reconciliation_refund_post_possible(uuid,uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.release_payment_reconciliation_refund_claim(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REFUND_CLAIM_GRANTS_INVALID';
  END IF;
  SELECT a.barbershop_id, b.owner_id, a.id
    INTO v_shop, v_owner, v_appointment
  FROM public.appointments a
  JOIN public.barbershops b ON b.id = a.barbershop_id
  ORDER BY a.created_at LIMIT 1;
  IF v_shop IS NULL THEN RAISE EXCEPTION 'REFUND_TEST_REQUIRES_DEV_APPOINTMENT'; END IF;

  INSERT INTO public.payment_reconciliations
    (id, barbershop_id, appointment_id, mp_payment_id, amount, currency,
     mp_payment_status, reason, status)
  SELECT fixture_id, v_shop, v_appointment, replace(fixture_id::text, '-', ''),
    1.00, 'ARS', 'approved', 'appointment_expired', 'pending_review'
  FROM unnest(ARRAY[v_legacy, v_v2, v_failed]) AS fixture_id;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  SELECT * INTO STRICT v_claim FROM public.claim_payment_reconciliation_refund(v_legacy);
  v_legacy_key := v_claim.refund_idempotency_key;
  IF v_claim.result <> 'claimed' OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_legacy AND status = 'refund_processing'
      AND refund_phase = 'post_possible' AND refund_claim_id IS NULL
  ) THEN RAISE EXCEPTION 'LEGACY_CLAIM_NOT_CONSERVATIVE'; END IF;

  SELECT * INTO STRICT v_claim FROM public.claim_payment_reconciliation_refund_v2(v_v2);
  v_key := v_claim.refund_idempotency_key;
  v_old_claim_id := v_claim.refund_claim_id;
  IF v_claim.result <> 'claimed' OR v_claim.refund_phase <> 'claimed_no_post'
    OR v_key IS NULL OR v_old_claim_id IS NULL THEN
    RAISE EXCEPTION 'V2_CLAIM_INVALID';
  END IF;
  SELECT refund_requested_at INTO v_first_requested_at
  FROM public.payment_reconciliations
  WHERE id = v_v2 AND refund_requested_by = v_owner;
  IF v_first_requested_at IS NULL THEN RAISE EXCEPTION 'V2_OPERATOR_NOT_STAMPED'; END IF;
  SELECT * INTO STRICT v_claim_b FROM public.claim_payment_reconciliation_refund_v2(v_v2);
  IF v_claim_b.result <> 'already_processing'
    OR v_claim_b.refund_claim_id IS DISTINCT FROM v_old_claim_id
    OR v_claim_b.refund_idempotency_key IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION 'SECOND_OPERATOR_REPLACED_CLAIM';
  END IF;
  BEGIN
    PERFORM public.retry_payment_reconciliation_refund(v_v2);
    RAISE EXCEPTION 'LEGACY_RETRY_ALLOWED_V2_CLAIM';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REFUND_CLAIM_OWNED_BY_V2' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.release_payment_reconciliation_refund_claim(
      v_legacy, NULL::uuid, v_legacy_key, 'verification_required');
    RAISE EXCEPTION 'LEGACY_RELEASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_REFUND_CLAIM_CONFLICT' THEN RAISE; END IF;
  END;
  v_result := public.release_payment_reconciliation_refund_claim(
    v_v2, v_old_claim_id, v_key, 'payment_verification_transient');
  IF v_result <> 'released' OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_v2 AND status = 'pending_review' AND refund_phase IS NULL
      AND refund_claim_id IS NULL AND refund_idempotency_key = v_key
  ) THEN RAISE EXCEPTION 'V2_RELEASE_FAILED'; END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT * INTO STRICT v_claim FROM public.claim_payment_reconciliation_refund_v2(v_v2);
  v_new_claim_id := v_claim.refund_claim_id;
  IF v_claim.result <> 'claimed' OR v_new_claim_id = v_old_claim_id
    OR v_claim.refund_idempotency_key IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION 'V2_RECLAIM_IDEMPOTENCY_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_v2 AND refund_requested_by = v_owner
      AND refund_requested_at > v_first_requested_at
  ) THEN RAISE EXCEPTION 'V2_RECLAIM_OPERATOR_TIME_NOT_REFRESHED'; END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.release_payment_reconciliation_refund_claim(
      v_v2, v_old_claim_id, v_key, 'payment_verification_transient');
    RAISE EXCEPTION 'STALE_RELEASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_REFUND_CLAIM_CONFLICT' THEN RAISE; END IF;
  END;
  v_result := public.mark_payment_reconciliation_refund_post_possible(v_v2, v_new_claim_id, v_key);
  IF v_result <> 'marked' THEN RAISE EXCEPTION 'POST_MARK_FAILED'; END IF;
  BEGIN
    PERFORM public.release_payment_reconciliation_refund_claim(
      v_v2, v_new_claim_id, v_key, 'payment_verification_transient');
    RAISE EXCEPTION 'POST_POSSIBLE_RELEASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_REFUND_CLAIM_CONFLICT' THEN RAISE; END IF;
  END;

  v_result := public.fail_payment_reconciliation_refund(v_v2, v_key, 'credential_error');
  IF v_result <> 'failed' OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_v2 AND status = 'refund_failed'
      AND refund_phase IS NULL AND refund_claim_id IS NULL
  ) THEN RAISE EXCEPTION 'FAILED_CLAIM_NOT_CLEARED'; END IF;
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT * INTO STRICT v_claim FROM public.retry_payment_reconciliation_refund_v2(v_v2);
  IF v_claim.result <> 'retried' OR v_claim.refund_claim_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_v2 AND status = 'refund_processing'
      AND refund_phase = 'claimed_no_post' AND refund_idempotency_key = v_key
  ) THEN RAISE EXCEPTION 'V2_RETRY_INVALID'; END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.complete_payment_reconciliation_refund(v_v2, 'refund-test-' || v_v2::text, 1.00, v_key);
  IF v_result <> 'refunded' OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_v2 AND status = 'refunded' AND refund_phase IS NULL
      AND refund_claim_id IS NULL AND refund_idempotency_key = v_key
  ) THEN RAISE EXCEPTION 'COMPLETED_CLAIM_NOT_CLEARED'; END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT * INTO STRICT v_claim FROM public.claim_payment_reconciliation_refund(v_failed);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.fail_payment_reconciliation_refund(
    v_failed, v_claim.refund_idempotency_key, 'credential_error');
  IF v_result <> 'failed' THEN RAISE EXCEPTION 'LEGACY_FAIL_FAILED'; END IF;
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.retry_payment_reconciliation_refund(v_failed);
  IF v_result <> 'retried' OR NOT EXISTS (
    SELECT 1 FROM public.payment_reconciliations
    WHERE id = v_failed AND refund_phase = 'post_possible' AND refund_claim_id IS NULL
  ) THEN RAISE EXCEPTION 'LEGACY_RETRY_NOT_CONSERVATIVE'; END IF;

  -- Model a historical processing row after migration: it is non-releasable.
  INSERT INTO public.payment_reconciliations
    (id, barbershop_id, appointment_id, mp_payment_id, amount, currency,
     mp_payment_status, reason, status, refund_idempotency_key,
     refund_requested_at, refund_phase)
  VALUES (v_historical, v_shop, v_appointment, replace(v_historical::text, '-', ''),
    1.00, 'ARS', 'approved', 'appointment_expired', 'refund_processing',
    gen_random_uuid(), clock_timestamp(), 'post_possible');
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.release_payment_reconciliation_refund_claim(
      v_historical, gen_random_uuid(),
      (SELECT refund_idempotency_key FROM public.payment_reconciliations WHERE id = v_historical),
      'payment_verification_transient');
    RAISE EXCEPTION 'HISTORICAL_RELEASE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PAYMENT_REFUND_CLAIM_CONFLICT' THEN RAISE; END IF;
  END;
END;
$test$;

ROLLBACK;
