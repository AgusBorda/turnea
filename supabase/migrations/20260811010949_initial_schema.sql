-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION IF EXISTS pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.handle_updated_at() TO anon;

GRANT ALL ON FUNCTION public.handle_updated_at() TO authenticated;

GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;

CREATE TABLE public.appointments (
  id               uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  barbershop_id    uuid                     NOT NULL,
  barber_id        uuid                     NOT NULL,
  service_id       uuid,
  client_id        uuid,
  date             date                     NOT NULL,
  start_time       time without time zone   NOT NULL,
  end_time         time without time zone   NOT NULL,
  status           text                     DEFAULT 'pending'::text NOT NULL,
  deposit_amount   numeric(10,2)            DEFAULT 0,
  deposit_status   text                     DEFAULT 'none'::text,
  client_name      text,
  client_phone     text,
  notes            text,
  cancelled_at     timestamp with time zone,
  cancelled_by     text,
  created_at       timestamp with time zone DEFAULT now(),
  updated_at       timestamp with time zone DEFAULT now(),
  mp_preference_id text,
  mp_payment_id    text
);

ALTER TABLE public.appointments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_deposit_status_check CHECK (deposit_status = ANY (ARRAY['none'::text, 'pending'::text, 'paid'::text, 'refunded'::text]));

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'pending_payment'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]));

GRANT ALL ON public.appointments TO anon;

GRANT ALL ON public.appointments TO authenticated;

GRANT ALL ON public.appointments TO service_role;

CREATE INDEX idx_appointments_mp_preference ON public.appointments (mp_preference_id);

CREATE INDEX idx_appointments_barbershop_date ON public.appointments (barbershop_id, date);

CREATE INDEX idx_appointments_barber_date ON public.appointments (barber_id, date);

CREATE INDEX idx_appointments_status ON public.appointments (status);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Appointments insert público" ON public.appointments
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Appointments select público por barbershop y fecha" ON public.appointments
  FOR SELECT
  USING (true);

CREATE TABLE public.barber_schedules (
  id          uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  barber_id   uuid                     NOT NULL,
  day_of_week integer                  NOT NULL,
  start_time  time without time zone   NOT NULL,
  end_time    time without time zone   NOT NULL,
  is_working  boolean                  DEFAULT true,
  created_at  timestamp with time zone DEFAULT now()
);

ALTER TABLE public.barber_schedules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barber_schedules
  ADD CONSTRAINT barber_schedules_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);

ALTER TABLE public.barber_schedules
  ADD CONSTRAINT barber_schedules_pkey PRIMARY KEY (id);

GRANT ALL ON public.barber_schedules TO anon;

GRANT ALL ON public.barber_schedules TO authenticated;

GRANT ALL ON public.barber_schedules TO service_role;

CREATE INDEX idx_barber_schedules_barber ON public.barber_schedules (barber_id);

CREATE POLICY "Schedules son públicos para leer" ON public.barber_schedules
  FOR SELECT
  USING (true);

CREATE TABLE public.barbers (
  id            uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  barbershop_id uuid                     NOT NULL,
  user_id       uuid,
  name          text                     NOT NULL,
  photo_url     text,
  bio           text,
  sort_order    integer                  DEFAULT 0,
  active        boolean                  DEFAULT true,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE public.barbers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barbers
  ADD CONSTRAINT barbers_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE CASCADE;

ALTER TABLE public.barber_schedules
  ADD CONSTRAINT barber_schedules_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE CASCADE;

ALTER TABLE public.barbers
  ADD CONSTRAINT barbers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT ALL ON public.barbers TO anon;

GRANT ALL ON public.barbers TO authenticated;

GRANT ALL ON public.barbers TO service_role;

CREATE INDEX idx_barbers_barbershop ON public.barbers (barbershop_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.barbers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Barbers son públicos para leer" ON public.barbers
  FOR SELECT
  USING ((active = true));

CREATE TABLE public.barbershops (
  id                   uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  owner_id             uuid                     NOT NULL,
  name                 text                     NOT NULL,
  slug                 text                     NOT NULL,
  description          text,
  address              text,
  phone                text,
  instagram            text,
  logo_url             text,
  cover_url            text,
  latitude             double precision,
  longitude            double precision,
  timezone             text                     DEFAULT 'America/Argentina/Buenos_Aires'::text,
  currency             text                     DEFAULT 'ARS'::text,
  deposit_required     boolean                  DEFAULT false,
  deposit_percentage   integer                  DEFAULT 50,
  slot_duration        integer                  DEFAULT 30,
  advance_booking_days integer                  DEFAULT 30,
  cancellation_hours   integer                  DEFAULT 2,
  active               boolean                  DEFAULT true,
  created_at           timestamp with time zone DEFAULT now(),
  updated_at           timestamp with time zone DEFAULT now(),
  mp_access_token      text,
  mp_user_id           text
);

CREATE POLICY "Owner gestiona appointments" ON public.appointments
  USING ((barbershop_id IN ( SELECT barbershops.id
   FROM public.barbershops
  WHERE (barbershops.owner_id = auth.uid()))));

CREATE POLICY "Owner puede gestionar schedules" ON public.barber_schedules
  USING ((barber_id IN ( SELECT b.id
   FROM (public.barbers b
     JOIN public.barbershops bs ON ((bs.id = b.barbershop_id)))
  WHERE (bs.owner_id = auth.uid()))));

CREATE POLICY "Owner puede gestionar barberos" ON public.barbers
  USING ((barbershop_id IN ( SELECT barbershops.id
   FROM public.barbershops
  WHERE (barbershops.owner_id = auth.uid()))));

ALTER TABLE public.barbershops
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE CASCADE;

ALTER TABLE public.barbers
  ADD CONSTRAINT barbers_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE CASCADE;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_slug_key UNIQUE (slug);

GRANT ALL ON public.barbershops TO anon;

GRANT ALL ON public.barbershops TO authenticated;

GRANT ALL ON public.barbershops TO service_role;

CREATE INDEX idx_barbershops_owner ON public.barbershops (owner_id);

CREATE INDEX idx_barbershops_slug ON public.barbershops (slug);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.barbershops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Barbershops son públicas para leer" ON public.barbershops
  FOR SELECT
  USING ((active = true));

CREATE POLICY "Owner puede gestionar su barbería" ON public.barbershops
  USING ((auth.uid() = owner_id));

CREATE TABLE public.blocked_slots (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  barber_id  uuid                     NOT NULL,
  date       date                     NOT NULL,
  start_time time without time zone,
  end_time   time without time zone,
  all_day    boolean                  DEFAULT false,
  reason     text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.blocked_slots
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blocked_slots
  ADD CONSTRAINT blocked_slots_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE CASCADE;

ALTER TABLE public.blocked_slots
  ADD CONSTRAINT blocked_slots_pkey PRIMARY KEY (id);

GRANT ALL ON public.blocked_slots TO anon;

GRANT ALL ON public.blocked_slots TO authenticated;

GRANT ALL ON public.blocked_slots TO service_role;

CREATE INDEX idx_blocked_slots_barber_date ON public.blocked_slots (barber_id, date);

CREATE POLICY "Blocked slots select público" ON public.blocked_slots
  FOR SELECT
  USING (true);

CREATE POLICY "Owner gestiona blocked slots" ON public.blocked_slots
  USING ((barber_id IN ( SELECT b.id
   FROM (public.barbers b
     JOIN public.barbershops bs ON ((bs.id = b.barbershop_id)))
  WHERE (bs.owner_id = auth.uid()))));

CREATE TABLE public.client_barbershop (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  client_id      uuid                     NOT NULL,
  barbershop_id  uuid                     NOT NULL,
  visits         integer                  DEFAULT 0,
  last_visit     timestamp with time zone,
  loyalty_points integer                  DEFAULT 0,
  notes          text,
  created_at     timestamp with time zone DEFAULT now()
);

ALTER TABLE public.client_barbershop
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_barbershop
  ADD CONSTRAINT client_barbershop_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE CASCADE;

ALTER TABLE public.client_barbershop
  ADD CONSTRAINT client_barbershop_client_id_barbershop_id_key UNIQUE (client_id, barbershop_id);

ALTER TABLE public.client_barbershop
  ADD CONSTRAINT client_barbershop_pkey PRIMARY KEY (id);

GRANT ALL ON public.client_barbershop TO anon;

GRANT ALL ON public.client_barbershop TO authenticated;

GRANT ALL ON public.client_barbershop TO service_role;

CREATE POLICY "Client barbershop insert público" ON public.client_barbershop
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owner ve client_barbershop" ON public.client_barbershop
  FOR SELECT
  USING ((barbershop_id IN ( SELECT barbershops.id
   FROM public.barbershops
  WHERE (barbershops.owner_id = auth.uid()))));

CREATE TABLE public.clients (
  id            uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  phone         text                     NOT NULL,
  name          text                     NOT NULL,
  email         text,
  notes         text,
  penalty_count integer                  DEFAULT 0,
  blocked       boolean                  DEFAULT false,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE public.clients
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_phone_key UNIQUE (phone);

ALTER TABLE public.clients
  ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.client_barbershop
  ADD CONSTRAINT client_barbershop_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

GRANT ALL ON public.clients TO anon;

GRANT ALL ON public.clients TO authenticated;

GRANT ALL ON public.clients TO service_role;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Clients acceso por barbershop" ON public.clients
  FOR SELECT
  USING ((id IN ( SELECT client_barbershop.client_id
   FROM public.client_barbershop
  WHERE (client_barbershop.barbershop_id IN ( SELECT barbershops.id
           FROM public.barbershops
          WHERE (barbershops.owner_id = auth.uid()))))));

CREATE POLICY "Clients insert público" ON public.clients
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owner puede actualizar clients" ON public.clients
  FOR UPDATE
  USING ((id IN ( SELECT client_barbershop.client_id
   FROM public.client_barbershop
  WHERE (client_barbershop.barbershop_id IN ( SELECT barbershops.id
           FROM public.barbershops
          WHERE (barbershops.owner_id = auth.uid()))))));

CREATE TABLE public.services (
  id            uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  barbershop_id uuid                     NOT NULL,
  name          text                     NOT NULL,
  description   text,
  duration      integer                  NOT NULL,
  price         numeric(10,2)            NOT NULL,
  active        boolean                  DEFAULT true,
  sort_order    integer                  DEFAULT 0,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE public.services
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.services
  ADD CONSTRAINT services_barbershop_id_fkey FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE CASCADE;

ALTER TABLE public.services
  ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

GRANT ALL ON public.services TO anon;

GRANT ALL ON public.services TO authenticated;

GRANT ALL ON public.services TO service_role;

CREATE INDEX idx_services_barbershop ON public.services (barbershop_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Owner puede gestionar services" ON public.services
  USING ((barbershop_id IN ( SELECT barbershops.id
   FROM public.barbershops
  WHERE (barbershops.owner_id = auth.uid()))));

CREATE POLICY "Services son públicos para leer" ON public.services
  FOR SELECT
  USING ((active = true));
