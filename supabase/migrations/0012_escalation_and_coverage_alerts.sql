-- Allow a third reminder type for manager escalation (idempotent constraint swap).
alter table public.shift_reminders drop constraint if exists shift_reminders_reminder_type_check;
alter table public.shift_reminders
  add constraint shift_reminders_reminder_type_check
  check (reminder_type in ('check_in', 'check_out', 'late_escalation'));

-- Dedup table so understaffing alerts fire once per (date, hour) window.
create table if not exists public.coverage_alerts (
  shift_date  date    not null,
  hour        int     not null,
  alerted_at  timestamptz not null default now(),
  primary key (shift_date, hour)
);
