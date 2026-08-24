-- COORDINATION REQUIRED: apply only after the deployed Dashboard creates
-- barbers through create_barber_with_default_schedule().
REVOKE INSERT ON TABLE public.barbers FROM PUBLIC, anon, authenticated;
