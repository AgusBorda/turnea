CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.appointments
  SET
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    cancelled_by = 'payment_expired'
  WHERE status = 'pending_payment'
    AND deposit_status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at <= clock_timestamp();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_expired_pending_payments()
  FROM PUBLIC, anon, authenticated, service_role;

DO $block$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'turnea-cleanup-expired-pending-payments'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END;
$block$;

SELECT cron.schedule(
  'turnea-cleanup-expired-pending-payments',
  '*/5 * * * *',
  'SELECT public.cleanup_expired_pending_payments();'
);
