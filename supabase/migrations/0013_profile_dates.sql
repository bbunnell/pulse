-- Birthday and work-anniversary dates for the Team Events calendar.
-- Stored as date (year-month-day). For birthdays the year is used only to
-- calculate age; for anniversaries the year records the hire/start date.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday          date,
  ADD COLUMN IF NOT EXISTS work_anniversary  date;
