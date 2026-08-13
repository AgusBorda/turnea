DROP POLICY IF EXISTS "Blocked slots select público" ON public.blocked_slots;

REVOKE ALL ON TABLE public.blocked_slots FROM anon;
