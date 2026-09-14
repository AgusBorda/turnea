-- A legacy Server Action treats retry() = 'already_processing' as permission
-- to POST. It must not receive that response while a V2 no-POST claim exists.
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

  IF v_reconciliation.status = 'refund_processing' THEN
    IF v_reconciliation.refund_phase = 'claimed_no_post' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REFUND_CLAIM_OWNED_BY_V2';
    END IF;
    RETURN 'already_processing';
  END IF;
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
