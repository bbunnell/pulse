-- Per-user Teams personal webhook URL (Power Automate flow URL).
-- When set, shift reminders are sent as a direct Teams message to that user
-- instead of (or in addition to) the global channel webhook.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teams_webhook_url text;
