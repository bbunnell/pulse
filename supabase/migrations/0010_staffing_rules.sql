-- ── Minimum-staffing rules ────────────────────────────────────────────────────
-- Define required coverage: "at least N people scheduled during this window on
-- these days". Evaluated against scheduled_shifts to surface understaffing
-- proactively (dashboard + reminder cron).

create table if not exists public.staffing_rules (
  id            uuid    primary key default gen_random_uuid(),
  name          text    not null,
  days_of_week  int[]   not null,                 -- 0=Sun … 6=Sat
  start_time    time    not null,
  end_time      time    not null,                 -- if <= start_time, window crosses midnight
  min_staff     int     not null default 1 check (min_staff >= 1),
  team_id       uuid    references public.teams(id) on delete cascade,  -- null = org-wide
  enabled       boolean not null default true,
  created_by    uuid    references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists staffing_rules_enabled_idx on public.staffing_rules(enabled);

drop trigger if exists staffing_rules_touch_updated_at on public.staffing_rules;
create trigger staffing_rules_touch_updated_at
  before update on public.staffing_rules
  for each row execute function public.touch_updated_at();

-- Default: 24/7 coverage, at least 1 person, every day.
insert into public.staffing_rules (name, days_of_week, start_time, end_time, min_staff, team_id, enabled)
select '24/7 minimum coverage', array[0,1,2,3,4,5,6], '00:00', '00:00', 1, null, true
where not exists (select 1 from public.staffing_rules);
