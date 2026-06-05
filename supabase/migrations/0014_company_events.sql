-- Company-wide calendar events (outings, parties, socials, etc.)
-- Visible to everyone; created and managed by managers and admins.

create table if not exists public.company_events (
  id          uuid    primary key default gen_random_uuid(),
  title       text    not null,
  description text,
  event_type  text    not null default 'other'
                      check (event_type in ('party','outing','social','team_building','meeting','other')),
  start_date  date    not null,
  end_date    date,                        -- null = single-day event
  created_by  uuid    references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists company_events_date_idx on public.company_events(start_date);

drop trigger if exists company_events_touch_updated_at on public.company_events;
create trigger company_events_touch_updated_at
  before update on public.company_events
  for each row execute function public.touch_updated_at();
