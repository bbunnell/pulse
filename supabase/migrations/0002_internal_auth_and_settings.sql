create table if not exists public.app_users (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_hash text not null,
  must_set_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.password_reset_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_profile_id_idx
  on public.password_reset_tokens(profile_id);

create index if not exists password_reset_tokens_expiry_idx
  on public.password_reset_tokens(expires_at)
  where used_at is null;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_users_touch_updated_at on public.app_users;
create trigger app_users_touch_updated_at before update on public.app_users
  for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at before update on public.app_settings
  for each row execute function public.touch_updated_at();
