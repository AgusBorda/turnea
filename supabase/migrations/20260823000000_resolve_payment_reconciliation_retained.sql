CREATE OR REPLACE FUNCTION public.resolve_payment_reconciliation_retained(
  p_reconciliation_id uuid,
  p_resolution_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_notes text := btrim(p_resolution_notes);
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_reconciliation_id IS NULL
    OR v_notes IS NULL
    OR v_notes = ''
    OR length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESOLUTION_DATA';
  END IF;

  SELECT reconciliation.status
  INTO v_status
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

  IF v_status = 'resolved_retained' THEN
    RETURN 'already_resolved';
  END IF;

  IF v_status <> 'pending_review' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVALID_RECONCILIATION_TRANSITION';
  END IF;

  UPDATE public.payment_reconciliations
  SET
    status = 'resolved_retained',
    resolved_at = clock_timestamp(),
    resolved_by = v_user_id,
    resolution_notes = v_notes
  WHERE id = p_reconciliation_id;

  RETURN 'resolved';
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_payment_reconciliation_retained(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_payment_reconciliation_retained(uuid, text)
  TO authenticated;
