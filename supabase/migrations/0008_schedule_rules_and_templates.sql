-- ── Schedule rules (recurring shift patterns) ────────────────────────────────
create table if not exists public.schedule_rules (
  id              uuid    primary key default gen_random_uuid(),
  profile_id      uuid    not null references public.profiles(id) on delete cascade,
  start_time      time    not null,
  end_time        time    not null,
  label           text,
  notes           text,
  -- days_of_week: 0=Sun, 1=Mon … 6=Sat (PostgreSQL array of integers)
  days_of_week    int[]   not null,
  -- repeat_weeks: 1 = every week, 2 = every other week, 4 = every 4th week
  repeat_weeks    int     not null default 1 check (repeat_weeks in (1, 2, 4)),
  effective_from  date    not null,
  effective_until date,             -- null = open-ended (generate 12 weeks at a time)
  created_by      uuid    references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists schedule_rules_profile_idx on public.schedule_rules(profile_id);
create index if not exists schedule_rules_from_idx    on public.schedule_rules(effective_from);

drop trigger if exists schedule_rules_touch_updated_at on public.schedule_rules;
create trigger schedule_rules_touch_updated_at
  before update on public.schedule_rules
  for each row execute function public.touch_updated_at();

-- ── Link generated shifts back to their rule ──────────────────────────────────
alter table public.scheduled_shifts
  add column if not exists rule_id  uuid references public.schedule_rules(id) on delete set null,
  add column if not exists is_open  boolean not null default false;

create index if not exists scheduled_shifts_rule_idx on public.scheduled_shifts(rule_id);

-- ── Schedule templates (reusable weekly patterns) ─────────────────────────────
create table if not exists public.schedule_templates (
  id          uuid  primary key default gen_random_uuid(),
  name        text  not null,
  description text,
  -- shifts: [{profileId, dayOfWeek (0-6), startTime, endTime, label?, notes?}]
  shifts      jsonb not null default '[]'::jsonb,
  created_by  uuid  references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists schedule_templates_touch_updated_at on public.schedule_templates;
create trigger schedule_templates_touch_updated_at
  before update on public.schedule_templates
  for each row execute function public.touch_updated_at();
