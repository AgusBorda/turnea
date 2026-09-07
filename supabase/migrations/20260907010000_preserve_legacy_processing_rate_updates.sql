-- P4E deploy compatibility: the currently deployed Settings form still writes
-- effective_processing_rate directly. Keep that legacy column permission until
-- every deployed client uses mp_base_processing_rate.
--
-- Rows with a base rate remain protected by the derivation constraint and
-- trigger. Effective-only legacy rows preserve their existing behavior.

GRANT UPDATE (effective_processing_rate)
ON public.barbershops
TO authenticated;
