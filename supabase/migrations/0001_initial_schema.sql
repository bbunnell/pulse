create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('employee', 'manager', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.profile_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.shift_status as enum ('open', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.segment_type as enum ('break', 'lunch');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.time_off_type as enum ('vacation', 'sick');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.time_off_status as enum ('submitted', 'approved', 'rejected', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.ics_method as enum ('REQUEST', 'CANCEL');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  manager_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role public.app_role not null default 'employee',
  team_id uuid references public.teams(id) on delete set null,
  status public.profile_status not null default 'active',
  expected_start_time time not null default '08:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.teams
    add constraint teams_manager_id_fkey foreign key (manager_id) references public.profiles(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  punch_in_at timestamptz not null,
  punch_out_at timestamptz,
  status public.shift_status not null default 'open',
  notes text,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_punch_order check (punch_out_at is null or punch_out_at > punch_in_at)
);

create unique index if not exists shifts_one_open_per_user
  on public.shifts (user_id)
  where punch_out_at is null;

create table if not exists public.shift_segments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  segment_type public.segment_type not null,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_segments_time_order check (end_at is null or end_at > start_at)
);

create unique index if not exists shift_segments_one_active_per_shift
  on public.shift_segments (shift_id)
  where end_at is null;

create table if not exists public.time_off_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  time_off_type public.time_off_type not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  full_day boolean not null default true,
  hours numeric(6,2) not null,
  status public.time_off_status not null default 'submitted',
  notes text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_order check (end_at > start_at),
  constraint time_off_hours_positive check (hours > 0)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email_type text not null,
  recipient_email text not null,
  subject text not null,
  status text not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null,
  enabled boolean not null default true,
  send_time time not null,
  timezone text not null default 'America/Chicago',
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ics_events (
  id uuid primary key default gen_random_uuid(),
  time_off_entry_id uuid not null references public.time_off_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  uid text not null unique,
  method public.ics_method not null default 'REQUEST',
  sequence integer not null default 0,
  file_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_team_id_idx on public.profiles(team_id);
create index if not exists shifts_user_time_idx on public.shifts(user_id, punch_in_at desc);
create index if not exists shift_segments_shift_idx on public.shift_segments(shift_id);
create index if not exists time_off_user_time_idx on public.time_off_entries(user_id, start_at, end_at);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teams_touch_updated_at on public.teams;
create trigger teams_touch_updated_at before update on public.teams
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists shifts_touch_updated_at on public.shifts;
create trigger shifts_touch_updated_at before update on public.shifts
  for each row execute function public.touch_updated_at();

drop trigger if exists shift_segments_touch_updated_at on public.shift_segments;
create trigger shift_segments_touch_updated_at before update on public.shift_segments
  for each row execute function public.touch_updated_at();

drop trigger if exists time_off_touch_updated_at on public.time_off_entries;
create trigger time_off_touch_updated_at before update on public.time_off_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists reminder_rules_touch_updated_at on public.reminder_rules;
create trigger reminder_rules_touch_updated_at before update on public.reminder_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists ics_events_touch_updated_at on public.ics_events;
create trigger ics_events_touch_updated_at before update on public.ics_events
  for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.can_manage_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = target_profile_id
    where actor.auth_user_id = auth.uid()
      and (
        actor.id = target.id
        or actor.role = 'admin'
        or (actor.role = 'manager' and actor.team_id is not null and actor.team_id = target.team_id)
      )
  )
$$;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_segments enable row level security;
alter table public.time_off_entries enable row level security;
alter table public.email_logs enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.ics_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Authenticated users can view teams" on public.teams;
create policy "Authenticated users can view teams"
  on public.teams for select
  to authenticated
  using (true);

drop policy if exists "Admins manage teams" on public.teams;
create policy "Admins manage teams"
  on public.teams for all
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "Profiles are visible by role" on public.profiles;
create policy "Profiles are visible by role"
  on public.profiles for select
  to authenticated
  using (public.can_manage_profile(id));

drop policy if exists "Admins create profiles" on public.profiles;
create policy "Admins create profiles"
  on public.profiles for insert
  to authenticated
  with check (public.current_role() = 'admin');

drop policy if exists "Managers and admins update profiles" on public.profiles;
create policy "Managers and admins update profiles"
  on public.profiles for update
  to authenticated
  using (public.can_manage_profile(id))
  with check (public.can_manage_profile(id));

drop policy if exists "Shifts are visible by role" on public.shifts;
create policy "Shifts are visible by role"
  on public.shifts for select
  to authenticated
  using (public.can_manage_profile(user_id));

drop policy if exists "Users insert their shifts" on public.shifts;
create policy "Users insert their shifts"
  on public.shifts for insert
  to authenticated
  with check (user_id = public.current_profile_id());

drop policy if exists "Users and managers update shifts" on public.shifts;
create policy "Users and managers update shifts"
  on public.shifts for update
  to authenticated
  using (public.can_manage_profile(user_id))
  with check (public.can_manage_profile(user_id));

drop policy if exists "Segments are visible by role" on public.shift_segments;
create policy "Segments are visible by role"
  on public.shift_segments for select
  to authenticated
  using (public.can_manage_profile(user_id));

drop policy if exists "Users insert their segments" on public.shift_segments;
create policy "Users insert their segments"
  on public.shift_segments for insert
  to authenticated
  with check (user_id = public.current_profile_id());

drop policy if exists "Users and managers update segments" on public.shift_segments;
create policy "Users and managers update segments"
  on public.shift_segments for update
  to authenticated
  using (public.can_manage_profile(user_id))
  with check (public.can_manage_profile(user_id));

drop policy if exists "Time off visible by role" on public.time_off_entries;
create policy "Time off visible by role"
  on public.time_off_entries for select
  to authenticated
  using (public.can_manage_profile(user_id));

drop policy if exists "Users insert their time off" on public.time_off_entries;
create policy "Users insert their time off"
  on public.time_off_entries for insert
  to authenticated
  with check (user_id = public.current_profile_id());

drop policy if exists "Users and managers update time off" on public.time_off_entries;
create policy "Users and managers update time off"
  on public.time_off_entries for update
  to authenticated
  using (public.can_manage_profile(user_id))
  with check (public.can_manage_profile(user_id));

drop policy if exists "Email logs visible by role" on public.email_logs;
create policy "Email logs visible by role"
  on public.email_logs for select
  to authenticated
  using (user_id is null or public.can_manage_profile(user_id));

drop policy if exists "Reminder rules visible to authenticated users" on public.reminder_rules;
create policy "Reminder rules visible to authenticated users"
  on public.reminder_rules for select
  to authenticated
  using (true);

drop policy if exists "Admins manage reminder rules" on public.reminder_rules;
create policy "Admins manage reminder rules"
  on public.reminder_rules for all
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "ICS events visible by role" on public.ics_events;
create policy "ICS events visible by role"
  on public.ics_events for select
  to authenticated
  using (public.can_manage_profile(user_id));

drop policy if exists "Users insert ICS events" on public.ics_events;
create policy "Users insert ICS events"
  on public.ics_events for insert
  to authenticated
  with check (user_id = public.current_profile_id() or public.current_role() = 'admin');

drop policy if exists "Audit logs visible by role" on public.audit_logs;
create policy "Audit logs visible by role"
  on public.audit_logs for select
  to authenticated
  using (
    public.current_role() = 'admin'
    or (actor_user_id is not null and public.can_manage_profile(actor_user_id))
    or (target_user_id is not null and public.can_manage_profile(target_user_id))
  );

drop policy if exists "Authenticated users insert audit logs" on public.audit_logs;
create policy "Authenticated users insert audit logs"
  on public.audit_logs for insert
  to authenticated
  with check (actor_user_id = public.current_profile_id() or public.current_role() = 'admin');
