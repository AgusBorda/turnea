REVOKE ALL PRIVILEGES ON TABLE public.appointments
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.appointments TO authenticated;
