-- Work schedule type controls how a profile appears on the dashboard.
--   'shift_based' (default) = person only appears active when they have an
--                             explicit entry in scheduled_shifts (e.g. NOC team).
--   'standard'              = person works regular hours; they are never shown in
--                             "Off Today" — they just work their standard days.
--
-- standard_work_days: 0=Sun … 6=Sat, evaluated in the employee's own timezone.
-- Defaults to Mon-Fri (1-5).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_schedule_type text NOT NULL DEFAULT 'shift_based'
    CHECK (work_schedule_type IN ('standard', 'shift_based')),
  ADD COLUMN IF NOT EXISTS standard_work_days  int[]  NOT NULL DEFAULT ARRAY[1,2,3,4,5];

-- Office staff (Bunnells) work standard hours
UPDATE public.profiles
SET    work_schedule_type = 'standard'
WHERE  email IN ('bbunnell@nbit.com', 'kbunnell@nbit.com', 'admin@company.local');
