-- Old deployments can still send a refund POST without marking a phase. Keep
-- their claims, and all historical processing rows, conservatively non-releasable.
ALTER TABLE public.payment_reconciliations
  ADD COLUMN refund_phase text,
  ADD COLUMN refund_claim_id uuid;

UPDATE public.payment_reconciliations
SET refund_phase = 'post_possible'
WHERE status = 'refund_processing';

ALTER TABLE public.payment_reconciliations
  ADD CONSTRAINT payment_reconciliations_refund_phase_check
    CHECK (refund_phase IS NULL OR refund_phase IN ('claimed_no_post', 'post_possible')),
  ADD CONSTRAINT payment_reconciliations_refund_phase_coherence_check
    CHECK (
      (status = 'refund_processing' AND refund_phase IS NOT NULL
        AND (refund_phase <> 'claimed_no_post' OR refund_claim_id IS NOT NULL))
      OR (status <> 'refund_processing' AND refund_phase IS NULL AND refund_claim_id IS NULL)
    );

-- Existing complete/fail RPCs keep their public contracts. Clear operational
-- claim metadata whenever either RPC leaves refund_processing.
CREATE FUNCTION public.clear_refund_claim_on_terminal_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status <> 'refund_processing' THEN
    NEW.refund_phase := NULL;
    NEW.refund_claim_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER clear_refund_claim_on_terminal_transition
  BEFORE UPDATE ON public.payment_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.clear_refund_claim_on_terminal_transition();

REVOKE ALL ON FUNCTION public.clear_refund_claim_on_terminal_transition()
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the legacy RPC result signature for old Preview instances. They
-- may POST immediately, so they must never receive a releasable phase.
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

  SELECT reconciliation.* INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  JOIN public.barbershops AS barbershop ON barbershop.id = reconciliation.barbershop_id
  WHERE reconciliation.id = p_reconciliation_id AND barbershop.owner_id = v_user_id
  FOR UPDATE OF reconciliation;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RECONCILIATION_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  CASE v_reconciliation.status
    WHEN 'pending_review' THEN
      UPDATE public.payment_reconciliations AS reconciliation
      SET status = 'refund_processing',
          refund_phase = 'post_possible',
          refund_claim_id = NULL,
          refund_idempotency_key = COALESCE(reconciliation.refund_idempotency_key, gen_random_uuid()),
          refund_requested_at = COALESCE(reconciliation.refund_requested_at, clock_timestamp()),
          refund_requested_by = COALESCE(reconciliation.refund_requested_by, v_user_id),
          last_error_code = NULL
      WHERE reconciliation.id = p_reconciliation_id
      RETURNING reconciliation.* INTO v_reconciliation;
      v_result := 'claimed';
    WHEN 'refund_processing' THEN v_result := 'already_processing';
    WHEN 'refund_failed' THEN v_result := 'failed_existing';
    WHEN 'refunded' THEN v_result := 'already_refunded';
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END CASE;

  RETURN QUERY SELECT v_result, v_reconciliation.id, v_reconciliation.barbershop_id,
    v_reconciliation.appointment_id, v_reconciliation.mp_payment_id,
    v_reconciliation.mp_preference_id, v_reconciliation.amount,
    v_reconciliation.currency, v_reconciliation.refund_idempotency_key,
    v_reconciliation.status, v_reconciliation.last_error_code;
END;
$function$;

-- The old retry path is also POST-capable without a marker.
CREATE OR REPLACE FUNCTION public.retry_payment_reconciliation_refund(p_reconciliation_id uuid)
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
  SELECT reconciliation.* INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  JOIN public.barbershops AS barbershop ON barbershop.id = reconciliation.barbershop_id
  WHERE reconciliation.id = p_reconciliation_id AND barbershop.owner_id = v_user_id
  FOR UPDATE OF reconciliation;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RECONCILIATION_NOT_FOUND_OR_NOT_OWNED';
  END IF;
  IF v_reconciliation.status = 'refund_processing' THEN RETURN 'already_processing'; END IF;
  IF v_reconciliation.status <> 'refund_failed'
    OR v_reconciliation.refund_idempotency_key IS NULL
    OR v_reconciliation.refund_requested_at IS NULL
    OR v_reconciliation.refund_requested_by IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END IF;
  UPDATE public.payment_reconciliations
  SET status = 'refund_processing', refund_phase = 'post_possible', refund_claim_id = NULL,
      last_error_code = NULL
  WHERE id = p_reconciliation_id;
  RETURN 'retried';
END;
$function$;

-- V2 wraps the legacy claim in the same database transaction. The row lock is
-- held until commit, so no legacy caller can observe the intermediate phase.
CREATE FUNCTION public.claim_payment_reconciliation_refund_v2(p_reconciliation_id uuid)
RETURNS TABLE (
  result text, reconciliation_id uuid, barbershop_id uuid, appointment_id uuid,
  mp_payment_id text, mp_preference_id text, amount numeric, currency text,
  refund_idempotency_key uuid, status text, last_error_code text,
  refund_phase text, refund_claim_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claim record;
  v_phase text;
  v_claim_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  SELECT * INTO STRICT v_claim FROM public.claim_payment_reconciliation_refund(p_reconciliation_id);
  IF v_claim.result = 'claimed' THEN
    UPDATE public.payment_reconciliations AS reconciliation
    SET refund_phase = 'claimed_no_post', refund_claim_id = gen_random_uuid()
    WHERE reconciliation.id = p_reconciliation_id
    RETURNING reconciliation.refund_phase, reconciliation.refund_claim_id INTO v_phase, v_claim_id;
  ELSE
    SELECT reconciliation.refund_phase, reconciliation.refund_claim_id
    INTO v_phase, v_claim_id
    FROM public.payment_reconciliations AS reconciliation
    WHERE reconciliation.id = p_reconciliation_id;
  END IF;
  RETURN QUERY SELECT v_claim.result, v_claim.reconciliation_id, v_claim.barbershop_id,
    v_claim.appointment_id, v_claim.mp_payment_id, v_claim.mp_preference_id,
    v_claim.amount, v_claim.currency, v_claim.refund_idempotency_key,
    v_claim.status, v_claim.last_error_code, v_phase, v_claim_id;
END;
$function$;

CREATE FUNCTION public.retry_payment_reconciliation_refund_v2(p_reconciliation_id uuid)
RETURNS TABLE (result text, refund_claim_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result text;
  v_claim_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;
  v_result := public.retry_payment_reconciliation_refund(p_reconciliation_id);
  IF v_result = 'retried' THEN
    UPDATE public.payment_reconciliations AS reconciliation
    SET refund_phase = 'claimed_no_post', refund_claim_id = gen_random_uuid()
    WHERE reconciliation.id = p_reconciliation_id
    RETURNING reconciliation.refund_claim_id INTO v_claim_id;
  END IF;
  RETURN QUERY SELECT v_result, v_claim_id;
END;
$function$;

CREATE FUNCTION public.mark_payment_reconciliation_refund_post_possible(
  p_reconciliation_id uuid, p_claim_id uuid, p_idempotency_key uuid
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
  SELECT reconciliation.* INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND OR v_reconciliation.status <> 'refund_processing'
    OR v_reconciliation.refund_phase <> 'claimed_no_post'
    OR v_reconciliation.refund_claim_id IS DISTINCT FROM p_claim_id
    OR v_reconciliation.refund_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_REFUND_CLAIM_CONFLICT';
  END IF;
  UPDATE public.payment_reconciliations
  SET refund_phase = 'post_possible' WHERE id = p_reconciliation_id;
  RETURN 'marked';
END;
$function$;

CREATE FUNCTION public.release_payment_reconciliation_refund_claim(
  p_reconciliation_id uuid, p_claim_id uuid, p_idempotency_key uuid, p_reason text
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
  IF p_reason IS NULL OR p_reason NOT IN (
    'payment_verification_transient', 'seller_mismatch', 'seller_missing',
    'verification_required'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REFUND_RELEASE_REASON';
  END IF;
  SELECT reconciliation.* INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND OR v_reconciliation.status <> 'refund_processing'
    OR v_reconciliation.refund_phase <> 'claimed_no_post'
    OR v_reconciliation.refund_claim_id IS DISTINCT FROM p_claim_id
    OR v_reconciliation.refund_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_REFUND_CLAIM_CONFLICT';
  END IF;
  UPDATE public.payment_reconciliations
  SET status = 'pending_review', refund_phase = NULL, refund_claim_id = NULL,
      last_error_code = p_reason
  WHERE id = p_reconciliation_id;
  RETURN 'released';
END;
$function$;

-- Defaults for future functions are EXECUTE opt-in. Explicit grants follow
-- the existing owner/server split.
REVOKE ALL ON FUNCTION public.claim_payment_reconciliation_refund_v2(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_payment_reconciliation_refund_v2(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.retry_payment_reconciliation_refund_v2(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.retry_payment_reconciliation_refund_v2(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.mark_payment_reconciliation_refund_post_possible(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment_reconciliation_refund_post_possible(uuid, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_payment_reconciliation_refund_claim(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_payment_reconciliation_refund_claim(uuid, uuid, uuid, text)
  TO service_role;
