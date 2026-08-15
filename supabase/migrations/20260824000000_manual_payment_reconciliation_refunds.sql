ALTER TABLE public.payment_reconciliations
  ADD COLUMN refund_requested_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payment_reconciliations
  ADD CONSTRAINT payment_reconciliations_refund_id_check
    CHECK (mp_refund_id IS NULL OR (
      mp_refund_id = btrim(mp_refund_id)
      AND mp_refund_id <> ''
      AND length(mp_refund_id) <= 255
    )),
  ADD CONSTRAINT payment_reconciliations_last_error_code_check
    CHECK (last_error_code IS NULL OR (
      last_error_code = btrim(last_error_code)
      AND last_error_code ~ '^[a-z0-9_]{1,64}$'
    )),
  ADD CONSTRAINT payment_reconciliations_refunded_coherence_check
    CHECK (status <> 'refunded' OR (
      mp_refund_id IS NOT NULL
      AND refund_amount IS NOT NULL
      AND refund_amount = amount
      AND refund_idempotency_key IS NOT NULL
      AND refund_requested_at IS NOT NULL
      AND resolved_at IS NOT NULL
    )),
  ADD CONSTRAINT payment_reconciliations_refund_processing_coherence_check
    CHECK (status <> 'refund_processing' OR (
      refund_idempotency_key IS NOT NULL
      AND refund_requested_at IS NOT NULL
    )),
  ADD CONSTRAINT payment_reconciliations_refund_failed_coherence_check
    CHECK (status <> 'refund_failed' OR (
      refund_idempotency_key IS NOT NULL
      AND refund_requested_at IS NOT NULL
      AND last_error_code IS NOT NULL
    ));

CREATE UNIQUE INDEX payment_reconciliations_refund_id_key
  ON public.payment_reconciliations (mp_refund_id)
  WHERE mp_refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_payment_reconciliation_refund(
  p_reconciliation_id uuid
)
RETURNS TABLE (
  result text,
  reconciliation_id uuid,
  barbershop_id uuid,
  appointment_id uuid,
  mp_payment_id text,
  mp_preference_id text,
  amount numeric,
  currency text,
  refund_idempotency_key uuid,
  status text,
  last_error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reconciliation public.payment_reconciliations%ROWTYPE;
  v_result text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_reconciliation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECONCILIATION_DATA';
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  JOIN public.barbershops AS barbershop
    ON barbershop.id = reconciliation.barbershop_id
  WHERE reconciliation.id = p_reconciliation_id
    AND barbershop.owner_id = v_user_id
  FOR UPDATE OF reconciliation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RECONCILIATION_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  CASE v_reconciliation.status
    WHEN 'pending_review' THEN
      UPDATE public.payment_reconciliations AS reconciliation
      SET
        status = 'refund_processing',
        refund_idempotency_key = COALESCE(reconciliation.refund_idempotency_key, gen_random_uuid()),
        refund_requested_at = COALESCE(reconciliation.refund_requested_at, clock_timestamp()),
        refund_requested_by = COALESCE(reconciliation.refund_requested_by, v_user_id),
        last_error_code = NULL
      WHERE reconciliation.id = p_reconciliation_id
      RETURNING reconciliation.* INTO v_reconciliation;
      v_result := 'claimed';
    WHEN 'refund_processing' THEN
      v_result := 'already_processing';
    WHEN 'refund_failed' THEN
      v_result := 'failed_existing';
    WHEN 'refunded' THEN
      v_result := 'already_refunded';
    WHEN 'resolved_retained' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END CASE;

  RETURN QUERY SELECT
    v_result,
    v_reconciliation.id,
    v_reconciliation.barbershop_id,
    v_reconciliation.appointment_id,
    v_reconciliation.mp_payment_id,
    v_reconciliation.mp_preference_id,
    v_reconciliation.amount,
    v_reconciliation.currency,
    v_reconciliation.refund_idempotency_key,
    v_reconciliation.status,
    v_reconciliation.last_error_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retry_payment_reconciliation_refund(
  p_reconciliation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_reconciliation public.payment_reconciliations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  JOIN public.barbershops AS barbershop
    ON barbershop.id = reconciliation.barbershop_id
  WHERE reconciliation.id = p_reconciliation_id
    AND barbershop.owner_id = v_user_id
  FOR UPDATE OF reconciliation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RECONCILIATION_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  IF v_reconciliation.status = 'refund_processing' THEN
    RETURN 'already_processing';
  END IF;

  IF v_reconciliation.status <> 'refund_failed'
    OR v_reconciliation.refund_idempotency_key IS NULL
    OR v_reconciliation.refund_requested_at IS NULL
    OR v_reconciliation.refund_requested_by IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END IF;

  UPDATE public.payment_reconciliations
  SET
    status = 'refund_processing',
    last_error_code = NULL
  WHERE id = p_reconciliation_id;

  RETURN 'retried';
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_payment_reconciliation_refund(
  p_reconciliation_id uuid,
  p_refund_id text,
  p_refund_amount numeric,
  p_idempotency_key uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reconciliation public.payment_reconciliations%ROWTYPE;
  v_refund_id text := btrim(p_refund_id);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_reconciliation_id IS NULL
    OR p_idempotency_key IS NULL
    OR v_refund_id IS NULL
    OR v_refund_id = ''
    OR length(v_refund_id) > 255
    OR p_refund_amount IS NULL
    OR p_refund_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REFUND_DATA';
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RECONCILIATION_NOT_FOUND';
  END IF;

  IF v_reconciliation.status = 'refunded' THEN
    IF v_reconciliation.refund_idempotency_key = p_idempotency_key
      AND v_reconciliation.mp_refund_id = v_refund_id
      AND v_reconciliation.refund_amount = p_refund_amount THEN
      RETURN 'already_refunded';
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PAYMENT_REFUND_INTEGRITY_CONFLICT';
  END IF;

  IF v_reconciliation.status <> 'refund_processing'
    OR v_reconciliation.refund_idempotency_key IS DISTINCT FROM p_idempotency_key
    OR v_reconciliation.amount IS DISTINCT FROM p_refund_amount THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PAYMENT_REFUND_INTEGRITY_CONFLICT';
  END IF;

  UPDATE public.payment_reconciliations
  SET
    status = 'refunded',
    mp_refund_id = v_refund_id,
    refund_amount = p_refund_amount,
    resolved_at = clock_timestamp(),
    resolved_by = refund_requested_by,
    last_error_code = NULL
  WHERE id = p_reconciliation_id;

  RETURN 'refunded';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_payment_reconciliation_refund(
  p_reconciliation_id uuid,
  p_idempotency_key uuid,
  p_error_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reconciliation public.payment_reconciliations%ROWTYPE;
  v_error_code text := lower(btrim(p_error_code));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF v_error_code IS NULL OR v_error_code NOT IN (
    'payment_not_refundable',
    'payment_too_old',
    'insufficient_balance',
    'credential_error',
    'financial_mismatch',
    'partial_refund_detected',
    'temporary_error',
    'unknown_error'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REFUND_ERROR_CODE';
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RECONCILIATION_NOT_FOUND';
  END IF;

  IF v_reconciliation.refund_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PAYMENT_REFUND_INTEGRITY_CONFLICT';
  END IF;

  IF v_reconciliation.status = 'refund_failed'
    AND v_reconciliation.last_error_code = v_error_code THEN
    RETURN 'already_failed';
  END IF;

  IF v_reconciliation.status <> 'refund_processing' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END IF;

  UPDATE public.payment_reconciliations
  SET
    status = 'refund_failed',
    last_error_code = v_error_code,
    resolved_at = NULL,
    resolved_by = NULL
  WHERE id = p_reconciliation_id;

  RETURN 'failed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_payment_reconciliation_refund_verification_required(
  p_reconciliation_id uuid,
  p_idempotency_key uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reconciliation public.payment_reconciliations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RECONCILIATION_NOT_FOUND';
  END IF;

  IF v_reconciliation.status <> 'refund_processing'
    OR v_reconciliation.refund_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PAYMENT_REFUND_INTEGRITY_CONFLICT';
  END IF;

  UPDATE public.payment_reconciliations
  SET last_error_code = 'verification_required'
  WHERE id = p_reconciliation_id;

  RETURN 'verification_required';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_payment_reconciliation_refund(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_payment_reconciliation_refund(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.retry_payment_reconciliation_refund(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.retry_payment_reconciliation_refund(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.complete_payment_reconciliation_refund(uuid, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_reconciliation_refund(uuid, text, numeric, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.fail_payment_reconciliation_refund(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_reconciliation_refund(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.mark_payment_reconciliation_refund_verification_required(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment_reconciliation_refund_verification_required(uuid, uuid)
  TO service_role;
