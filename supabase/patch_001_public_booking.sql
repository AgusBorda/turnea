-- ============================================
-- PARCHE: Permisos adicionales para flujo público de reserva
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Permitir SELECT de appointments para ver disponibilidad (solo campos necesarios via la app)
-- La policy "Appointments select público por barbershop y fecha" ya existe y permite select público

-- Permitir SELECT de barber_schedules (ya tiene policy pública)
-- Permitir SELECT de blocked_slots (ya tiene policy pública)

-- Si el flujo de reserva falla, puede ser que necesites estas policies adicionales.
-- Verificá que existan ejecutando:

-- SELECT policyname FROM pg_policies WHERE tablename = 'appointments';
-- Debería incluir "Appointments select público por barbershop y fecha"

-- Si NO existe, ejecutá:
-- create policy "Appointments select público por barbershop y fecha" on public.appointments
--   for select using (true);

-- NOTA: El flujo de reserva ahora NO requiere crear/buscar clients.
-- Solo hace INSERT en appointments (que ya tiene policy pública de insert).
