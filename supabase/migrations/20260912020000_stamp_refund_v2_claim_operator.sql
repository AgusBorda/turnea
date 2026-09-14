-- Reacquiring a released claim keeps the financial idempotency key, but the
-- operational request metadata must identify the current V2 operator/time.
-- Legacy claims remain unchanged because they only enter post_possible.
CREATE FUNCTION public.stamp_refund_v2_claim_operator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'refund_processing'
    AND NEW.refund_phase = 'claimed_no_post'
    AND OLD.refund_phase IS DISTINCT FROM 'claimed_no_post' THEN
    IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
    END IF;
    NEW.refund_requested_by := auth.uid();
    NEW.refund_requested_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER stamp_refund_v2_claim_operator
  BEFORE UPDATE ON public.payment_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_refund_v2_claim_operator();

REVOKE ALL ON FUNCTION public.stamp_refund_v2_claim_operator()
  FROM PUBLIC, anon, authenticated, service_role;
