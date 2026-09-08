-- Company holidays, with per-person participation.
--
-- DESIGN: a holiday does not become a new thing the rest of the app has to learn
-- about. It materialises into ordinary `time_off_entries` rows (type 'holiday',
-- source 'holiday') for the people who are OFF. Everything that already reasons
-- about time off then works with no changes at all:
--
--   * check-in / check-out reminders already skip anyone on approved time off,
--     so nobody gets nagged to clock in on a holiday
--   * late escalation already skips them, so managers get no false alarms
--   * deriveStandardShifts already drops them, so the schedule board shows only
--     the people actually covering
--   * coverage and understaffing derive from that board, so the holiday's real
--     staffing is what gets measured
--   * weekly reports and CSV exports already total time off
--
-- People assigned to WORK the holiday simply get no row, so they stay scheduled
-- exactly as normal.
--
-- The alternative — a `holidays` lookup consulted at every one of those points —
-- would have meant touching six separate code paths, four of which are raw SQL,
-- and each is a place a timezone or boundary bug could hide.

alter type public.time_off_type add value if not exists 'holiday';

create table if not exists public.holidays (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  start_date    date not null,
  end_date      date not null,            -- same as start_date for a single day
  -- Which way the exception list reads. 'off' means the company is closed and
  -- the listed people are the skeleton crew who WORK; 'working' means it is a
  -- normal day and the listed people are the ones taking it OFF. One list,
  -- both directions, because real holidays come in both shapes: Christmas
  -- (closed, two people covering) and Black Friday (open, four people out).
  default_participation text not null default 'off'
                        check (default_participation in ('off','working')),
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint holidays_dates_ordered check (end_date >= start_date)
);

create index if not exists holidays_date_idx on public.holidays(start_date, end_date);

-- Whoever differs from the holiday's default.
create table if not exists public.holiday_exceptions (
  holiday_id uuid not null references public.holidays(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (holiday_id, profile_id)
);

create index if not exists holiday_exceptions_profile_idx
  on public.holiday_exceptions(profile_id);

drop trigger if exists holidays_touch_updated_at on public.holidays;
create trigger holidays_touch_updated_at
  before update on public.holidays
  for each row execute function public.touch_updated_at();

-- Materialised rows are tagged so they can be regenerated wholesale without
-- touching anything a person entered by hand.
create index if not exists time_off_entries_holiday_src_idx
  on public.time_off_entries(source)
  where source = 'holiday';

grant select, insert, update, delete on table public.holidays to teampulse;
grant select, insert, update, delete on table public.holiday_exceptions to teampulse;
