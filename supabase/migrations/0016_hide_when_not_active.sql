-- When true, this person only appears on the attendance dashboard when
-- they are actively clocked in or on approved leave.
-- They will NOT appear in Late, Not In Yet, or Off Today sections.
-- Useful for people who work irregular/infrequent hours.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_when_not_active boolean NOT NULL DEFAULT false;

-- Kym Bunnell works irregularly — suppress from board when not in
UPDATE public.profiles
SET    hide_when_not_active = true,
       work_schedule_type   = 'shift_based'   -- no regular schedule either
WHERE  email = 'kbunnell@nbit.com';
