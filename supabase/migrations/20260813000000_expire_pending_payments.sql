ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

UPDATE public.appointments
SET expires_at = COALESCE(created_at, now()) + interval '15 minutes'
WHERE status = 'pending_payment'
  AND deposit_status = 'pending'
  AND expires_at IS NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_pending_payment_expires_at_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_pending_payment_expires_at_check
  CHECK (
    status <> 'pending_payment'
    OR deposit_status IS DISTINCT FROM 'pending'
    OR expires_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_appointments_pending_expiration
  ON public.appointments (expires_at)
  WHERE status = 'pending_payment' AND deposit_status = 'pending';
