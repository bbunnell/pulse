-- ─── Scheduled Shifts ────────────────────────────────────────────────────────
-- Stores future scheduled coverage blocks (who is working when).
-- shift_date + start_time / end_time are stored in the team's local timezone.
-- If end_time <= start_time, the shift crosses midnight into the next calendar day.

create table if not exists public.scheduled_shifts (
  id           uuid      primary key default gen_random_uuid(),
  profile_id   uuid      not null references public.profiles(id) on delete cascade,
  shift_date   date      not null,
  start_time   time      not null,
  end_time     time      not null,
  label        text,                              -- e.g. "Overnight", "Day", "Evening"
  notes        text,
  created_by   uuid      references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists scheduled_shifts_date_idx
  on public.scheduled_shifts(shift_date);

create index if not exists scheduled_shifts_profile_date_idx
  on public.scheduled_shifts(profile_id, shift_date);

drop trigger if exists scheduled_shifts_touch_updated_at on public.scheduled_shifts;
create trigger scheduled_shifts_touch_updated_at
  before update on public.scheduled_shifts
  for each row execute function public.touch_updated_at();
