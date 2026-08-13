DROP POLICY IF EXISTS "Appointments select público por barbershop y fecha" ON public.appointments;
DROP POLICY IF EXISTS "Owner gestiona appointments" ON public.appointments;

CREATE POLICY "Owner lee appointments de su barbería" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops AS bs
      WHERE bs.id = appointments.barbershop_id
        AND bs.owner_id = auth.uid()
    )
  );

REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT ON public.appointments TO authenticated;
