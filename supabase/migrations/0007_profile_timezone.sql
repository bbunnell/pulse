-- Per-user IANA timezone (e.g. "Asia/Manila", "America/Chicago").
-- Used for display conversion and for firing shift reminders at the
-- correct wall-clock time for each employee.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Chicago';
