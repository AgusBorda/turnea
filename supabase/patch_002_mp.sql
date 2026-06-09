-- ============================================
-- PARCHE 002: Integración Mercado Pago + mejoras
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Agregar columnas de MP a barbershops
alter table public.barbershops
  add column if not exists mp_access_token text,
  add column if not exists mp_user_id text;

-- 2. Agregar columnas de MP a appointments
alter table public.appointments
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;

-- 3. Ampliar el check de status para incluir pending_payment
alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('pending', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- 4. Verificar que advance_booking_days existe (ya está en schema original)
-- Si no existe: alter table public.barbershops add column if not exists advance_booking_days integer default 30;

-- 5. Índice para buscar appointments por preference_id (para webhook)
create index if not exists idx_appointments_mp_preference on public.appointments(mp_preference_id);

-- ============================================
-- NOTA IMPORTANTE:
-- - mp_access_token: el token de producción o test de MP del barbero
--   Formato producción: APP_USR-XXXXXXXXX
--   Formato test:       TEST-XXXXXXXXX
-- - La dirección NO se muestra en la página pública hasta que el cliente señe.
-- ============================================
