-- Controls whether a profile appears on the attendance dashboard.
-- Set to false for placeholder/system accounts that never clock in.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_on_dashboard boolean NOT NULL DEFAULT true;
