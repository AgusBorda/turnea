-- Remove the broad legacy table contract before granting only the operations
-- used by the current owner dashboard. Public reads remain available solely
-- through get_public_barbers() and is_public_barber_active().
REVOKE ALL ON TABLE public.barbers FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.barbers TO authenticated;
GRANT UPDATE (name, bio, active) ON TABLE public.barbers TO authenticated;

DROP POLICY IF EXISTS "Owner puede gestionar barberos" ON public.barbers;
DROP POLICY IF EXISTS "Owner lee barberos de su barbería" ON public.barbers;
DROP POLICY IF EXISTS "Owner actualiza barberos de su barbería" ON public.barbers;

CREATE POLICY "Owner lee barberos de su barbería"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops AS barbershop
      WHERE barbershop.id = barbers.barbershop_id
        AND barbershop.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner actualiza barberos de su barbería"
  ON public.barbers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops AS barbershop
      WHERE barbershop.id = barbers.barbershop_id
        AND barbershop.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops AS barbershop
      WHERE barbershop.id = barbers.barbershop_id
        AND barbershop.owner_id = auth.uid()
    )
  );
