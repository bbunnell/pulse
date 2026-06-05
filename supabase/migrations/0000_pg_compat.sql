-- Vanilla PostgreSQL (e.g. Docker) lacks Supabase's auth schema, auth.uid(), and the
-- "authenticated" role. Without this, 0001_initial_schema.sql fails before creating public.profiles.
-- On Supabase Cloud, auth.users / auth.uid / authenticated already exist — these blocks no-op.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
exception
  when duplicate_object then null;
end $$;

create schema if not exists auth;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    create table auth.users (
      id uuid primary key
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'auth'
      and p.proname = 'uid'
      and p.pronargs = 0
  ) then
    create function auth.uid() returns uuid
    language sql
    stable
    as $fn$
      select null::uuid
    $fn$;
  end if;
end $$;
