-- Per-weekday hour overrides.
--
-- expected_start_time / expected_end_time hold ONE window for every work day, so
-- an employee like RJ (10:00-19:00 Fri/Sat/Sun but 12:00-21:00 Wed/Thu) could not
-- be represented. That variation used to live in scheduled_shifts rows; when hours
-- moved onto the profile it had nowhere to go.
--
-- Stored as overrides rather than a full per-day table so existing profiles need no
-- migration: a day absent from the map simply uses the default window. Keys are the
-- day of week 0-6 (Sun-Sat), matching standard_work_days.
--   {"3": {"start": "12:00", "end": "21:00"}, "4": {"start": "12:00", "end": "21:00"}}
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_day_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.work_day_hours IS
  'Per-weekday hour overrides keyed by dow 0-6. Absent day = use expected_start_time/expected_end_time.';
