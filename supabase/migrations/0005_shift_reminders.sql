-- ─── Shift reminder tracking ──────────────────────────────────────────────────
-- Records each reminder sent so the cron never double-fires for the same event.

create table if not exists public.shift_reminders (
  id                  uuid        primary key default gen_random_uuid(),
  profile_id          uuid        not null references public.profiles(id) on delete cascade,
  scheduled_shift_id  uuid        not null references public.scheduled_shifts(id) on delete cascade,
  reminder_type       text        not null check (reminder_type in ('check_in', 'check_out')),
  channels_sent       text[]      not null default '{}',   -- ['email', 'teams']
  sent_at             timestamptz not null default now(),
  -- one reminder per shift per type — idempotent
  unique (scheduled_shift_id, reminder_type)
);

create index if not exists shift_reminders_profile_idx
  on public.shift_reminders(profile_id);

create index if not exists shift_reminders_sent_at_idx
  on public.shift_reminders(sent_at desc);
