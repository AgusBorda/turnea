-- ============================================
-- TURNEA - Schema de Base de Datos
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLA: barbershops (Barberías)
-- ============================================
create table public.barbershops (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  description text,
  address text,
  phone text,
  instagram text,
  logo_url text,
  cover_url text,
  latitude double precision,
  longitude double precision,
  timezone text default 'America/Argentina/Buenos_Aires',
  currency text default 'ARS',
  deposit_required boolean default false,
  deposit_percentage integer default 50,
  slot_duration integer default 30, -- duración base en minutos
  advance_booking_days integer default 30, -- días de anticipación máx
  cancellation_hours integer default 2, -- horas antes para cancelar
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TABLA: barbers (Peluqueros/Barberos)
-- ============================================
create table public.barbers (
  id uuid default uuid_generate_v4() primary key,
  barbershop_id uuid references public.barbershops(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  photo_url text,
  bio text,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TABLA: barber_schedules (Horarios de cada barbero)
-- ============================================
create table public.barber_schedules (
  id uuid default uuid_generate_v4() primary key,
  barber_id uuid references public.barbers(id) on delete cascade not null,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Domingo, 6=Sábado
  start_time time not null,
  end_time time not null,
  is_working boolean default true,
  created_at timestamptz default now()
);

-- ============================================
-- TABLA: services (Servicios)
-- ============================================
create table public.services (
  id uuid default uuid_generate_v4() primary key,
  barbershop_id uuid references public.barbershops(id) on delete cascade not null,
  name text not null,
  description text,
  duration integer not null, -- duración en minutos
  price numeric(10,2) not null,
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TABLA: clients (Clientes)
-- ============================================
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  phone text not null,
  name text not null,
  email text,
  notes text,
  penalty_count integer default 0,
  blocked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(phone)
);

-- ============================================
-- TABLA: client_barbershop (Relación cliente-barbería)
-- ============================================
create table public.client_barbershop (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  barbershop_id uuid references public.barbershops(id) on delete cascade not null,
  visits integer default 0,
  last_visit timestamptz,
  loyalty_points integer default 0,
  notes text,
  created_at timestamptz default now(),
  unique(client_id, barbershop_id)
);

-- ============================================
-- TABLA: appointments (Turnos)
-- ============================================
create table public.appointments (
  id uuid default uuid_generate_v4() primary key,
  barbershop_id uuid references public.barbershops(id) on delete cascade not null,
  barber_id uuid references public.barbers(id) on delete cascade not null,
  service_id uuid references public.services(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  deposit_amount numeric(10,2) default 0,
  deposit_status text default 'none' check (deposit_status in ('none', 'pending', 'paid', 'refunded')),
  client_name text,
  client_phone text,
  notes text,
  cancelled_at timestamptz,
  cancelled_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TABLA: blocked_slots (Bloqueos de horario)
-- ============================================
create table public.blocked_slots (
  id uuid default uuid_generate_v4() primary key,
  barber_id uuid references public.barbers(id) on delete cascade not null,
  date date not null,
  start_time time,
  end_time time,
  all_day boolean default false,
  reason text,
  created_at timestamptz default now()
);

-- ============================================
-- INDICES
-- ============================================
create index idx_barbershops_slug on public.barbershops(slug);
create index idx_barbershops_owner on public.barbershops(owner_id);
create index idx_barbers_barbershop on public.barbers(barbershop_id);
create index idx_services_barbershop on public.services(barbershop_id);
create index idx_appointments_barbershop_date on public.appointments(barbershop_id, date);
create index idx_appointments_barber_date on public.appointments(barber_id, date);
create index idx_appointments_status on public.appointments(status);
create index idx_blocked_slots_barber_date on public.blocked_slots(barber_id, date);
create index idx_barber_schedules_barber on public.barber_schedules(barber_id);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Barbershops: pública para leer (por slug), owner para editar
alter table public.barbershops enable row level security;

create policy "Barbershops son públicas para leer" on public.barbershops
  for select using (active = true);

create policy "Owner puede gestionar su barbería" on public.barbershops
  for all using (auth.uid() = owner_id);

-- Barbers: públicos para leer, owner de barbería para gestionar
alter table public.barbers enable row level security;

create policy "Barbers son públicos para leer" on public.barbers
  for select using (active = true);

create policy "Owner puede gestionar barberos" on public.barbers
  for all using (
    barbershop_id in (
      select id from public.barbershops where owner_id = auth.uid()
    )
  );

-- Barber schedules: públicos para leer
alter table public.barber_schedules enable row level security;

create policy "Schedules son públicos para leer" on public.barber_schedules
  for select using (true);

create policy "Owner puede gestionar schedules" on public.barber_schedules
  for all using (
    barber_id in (
      select b.id from public.barbers b
      join public.barbershops bs on bs.id = b.barbershop_id
      where bs.owner_id = auth.uid()
    )
  );

-- Services: públicos para leer
alter table public.services enable row level security;

create policy "Services son públicos para leer" on public.services
  for select using (active = true);

create policy "Owner puede gestionar services" on public.services
  for all using (
    barbershop_id in (
      select id from public.barbershops where owner_id = auth.uid()
    )
  );

-- Clients: el owner de la barbería puede ver sus clientes
alter table public.clients enable row level security;

create policy "Clients acceso por barbershop" on public.clients
  for select using (
    id in (
      select client_id from public.client_barbershop
      where barbershop_id in (
        select id from public.barbershops where owner_id = auth.uid()
      )
    )
  );

create policy "Clients insert público" on public.clients
  for insert with check (true);

create policy "Owner puede actualizar clients" on public.clients
  for update using (
    id in (
      select client_id from public.client_barbershop
      where barbershop_id in (
        select id from public.barbershops where owner_id = auth.uid()
      )
    )
  );

-- Client barbershop
alter table public.client_barbershop enable row level security;

create policy "Client barbershop insert público" on public.client_barbershop
  for insert with check (true);

create policy "Owner ve client_barbershop" on public.client_barbershop
  for select using (
    barbershop_id in (
      select id from public.barbershops where owner_id = auth.uid()
    )
  );

-- Appointments: públicos para insertar, owner para gestionar
alter table public.appointments enable row level security;

create policy "Appointments insert público" on public.appointments
  for insert with check (true);

create policy "Owner gestiona appointments" on public.appointments
  for all using (
    barbershop_id in (
      select id from public.barbershops where owner_id = auth.uid()
    )
  );

create policy "Appointments select público por barbershop y fecha" on public.appointments
  for select using (true);

-- Blocked slots
alter table public.blocked_slots enable row level security;

create policy "Blocked slots select público" on public.blocked_slots
  for select using (true);

create policy "Owner gestiona blocked slots" on public.blocked_slots
  for all using (
    barber_id in (
      select b.id from public.barbers b
      join public.barbershops bs on bs.id = b.barbershop_id
      where bs.owner_id = auth.uid()
    )
  );

-- ============================================
-- FUNCIÓN: updated_at trigger
-- ============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers para updated_at
create trigger set_updated_at before update on public.barbershops
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.barbers
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.services
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.clients
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.appointments
  for each row execute function public.handle_updated_at();
