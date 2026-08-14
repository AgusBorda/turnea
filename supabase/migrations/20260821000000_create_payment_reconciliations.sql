CREATE TABLE public.payment_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid NOT NULL
    REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL
    REFERENCES public.appointments(id) ON DELETE RESTRICT,
  mp_payment_id text NOT NULL UNIQUE,
  mp_preference_id text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL,
  mp_payment_status text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  mp_refund_id text,
  refund_amount numeric(10,2),
  refund_idempotency_key uuid UNIQUE,
  refund_requested_at timestamptz,
  last_error_code text,
  CONSTRAINT payment_reconciliations_payment_id_check
    CHECK (mp_payment_id = btrim(mp_payment_id) AND mp_payment_id <> '' AND length(mp_payment_id) <= 255),
  CONSTRAINT payment_reconciliations_preference_id_check
    CHECK (mp_preference_id IS NULL OR (
      mp_preference_id = btrim(mp_preference_id)
      AND mp_preference_id <> ''
      AND length(mp_preference_id) <= 255
    )),
  CONSTRAINT payment_reconciliations_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_reconciliations_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_reconciliations_payment_status_check
    CHECK (mp_payment_status = 'approved'),
  CONSTRAINT payment_reconciliations_refund_amount_nonnegative
    CHECK (refund_amount IS NULL OR refund_amount >= 0),
  CONSTRAINT payment_reconciliations_reason_check
    CHECK (reason IN ('appointment_expired', 'confirmation_conflict')),
  CONSTRAINT payment_reconciliations_status_check
    CHECK (status IN (
      'pending_review',
      'refund_processing',
      'refunded',
      'resolved_retained',
      'refund_failed'
    ))
);

CREATE INDEX payment_reconciliations_barbershop_status_idx
  ON public.payment_reconciliations (barbershop_id, status);

CREATE INDEX payment_reconciliations_appointment_idx
  ON public.payment_reconciliations (appointment_id);

CREATE INDEX payment_reconciliations_detected_at_idx
  ON public.payment_reconciliations (detected_at DESC);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payment_reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner lee conciliaciones de su barbería"
  ON public.payment_reconciliations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops AS barbershop
      WHERE barbershop.id = payment_reconciliations.barbershop_id
        AND barbershop.owner_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.payment_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_reconciliations TO authenticated;
GRANT ALL ON TABLE public.payment_reconciliations TO service_role;

CREATE OR REPLACE FUNCTION public.register_payment_reconciliation(
  p_barbershop_id uuid,
  p_appointment_id uuid,
  p_mp_payment_id text,
  p_mp_preference_id text,
  p_amount numeric,
  p_currency text,
  p_mp_payment_status text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment_barbershop_id uuid;
  v_appointment_preference_id text;
  v_appointment_amount numeric(10,2);
  v_barbershop_currency text;
  v_reconciliation public.payment_reconciliations%ROWTYPE;
  v_reconciliation_id uuid;
  v_mp_payment_id text := btrim(p_mp_payment_id);
  v_mp_preference_id text := NULLIF(btrim(p_mp_preference_id), '');
  v_currency text := upper(btrim(p_currency));
  v_mp_payment_status text := lower(btrim(p_mp_payment_status));
  v_reason text := lower(btrim(p_reason));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED';
  END IF;

  IF p_barbershop_id IS NULL
    OR p_appointment_id IS NULL
    OR v_mp_payment_id IS NULL
    OR v_mp_payment_id = ''
    OR length(v_mp_payment_id) > 255
    OR (v_mp_preference_id IS NOT NULL AND length(v_mp_preference_id) > 255)
    OR p_amount IS NULL
    OR p_amount <= 0
    OR p_amount <> round(p_amount, 2)
    OR v_currency !~ '^[A-Z]{3}$'
    OR v_mp_payment_status <> 'approved'
    OR v_reason NOT IN ('appointment_expired', 'confirmation_conflict') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECONCILIATION_DATA';
  END IF;

  SELECT
    appointment.barbershop_id,
    NULLIF(btrim(appointment.mp_preference_id), ''),
    appointment.deposit_amount,
    upper(btrim(barbershop.currency))
  INTO
    v_appointment_barbershop_id,
    v_appointment_preference_id,
    v_appointment_amount,
    v_barbershop_currency
  FROM public.appointments AS appointment
  JOIN public.barbershops AS barbershop
    ON barbershop.id = appointment.barbershop_id
  WHERE appointment.id = p_appointment_id
  FOR KEY SHARE OF appointment, barbershop;

  IF NOT FOUND OR v_appointment_barbershop_id <> p_barbershop_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECONCILIATION_APPOINTMENT';
  END IF;

  IF v_appointment_preference_id IS DISTINCT FROM v_mp_preference_id
    OR v_appointment_amount IS DISTINCT FROM p_amount
    OR v_barbershop_currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_RECONCILIATION_FINANCIAL_MISMATCH';
  END IF;

  INSERT INTO public.payment_reconciliations (
    barbershop_id,
    appointment_id,
    mp_payment_id,
    mp_preference_id,
    amount,
    currency,
    mp_payment_status,
    reason,
    status
  )
  VALUES (
    p_barbershop_id,
    p_appointment_id,
    v_mp_payment_id,
    v_mp_preference_id,
    p_amount,
    v_currency,
    v_mp_payment_status,
    v_reason,
    'pending_review'
  )
  ON CONFLICT (mp_payment_id) DO NOTHING
  RETURNING id INTO v_reconciliation_id;

  IF v_reconciliation_id IS NOT NULL THEN
    RETURN v_reconciliation_id;
  END IF;

  SELECT reconciliation.*
  INTO v_reconciliation
  FROM public.payment_reconciliations AS reconciliation
  WHERE reconciliation.mp_payment_id = v_mp_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_RECONCILIATION_CONFLICT';
  END IF;

  IF v_reconciliation.barbershop_id <> p_barbershop_id
    OR v_reconciliation.appointment_id <> p_appointment_id
    OR v_reconciliation.mp_preference_id IS DISTINCT FROM v_mp_preference_id
    OR v_reconciliation.amount <> p_amount
    OR v_reconciliation.currency <> v_currency
    OR v_reconciliation.mp_payment_status <> v_mp_payment_status
    OR v_reconciliation.reason <> v_reason THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAYMENT_RECONCILIATION_INTEGRITY_CONFLICT';
  END IF;

  RETURN v_reconciliation.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_payment_reconciliation(
  uuid, uuid, text, text, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_payment_reconciliation(
  uuid, uuid, text, text, numeric, text, text, text
) TO service_role;
