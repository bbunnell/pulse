-- Idempotent bootstrap seed for internal PostgreSQL deployments.
-- Default admin login after running this seed:
--   email: admin@company.local
--   password: ChangeMeNow123!
-- Change this password immediately after first login.

create extension if not exists pgcrypto;

insert into public.teams (id, name, manager_id)
values
  ('11111111-1111-1111-1111-111111111111', 'Operations', null),
  ('22222222-2222-2222-2222-222222222222', 'Customer Support', null)
on conflict (id) do update
set name = excluded.name;

insert into public.profiles (
  id,
  first_name,
  last_name,
  email,
  role,
  team_id,
  status,
  expected_start_time
)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'System', 'Admin', 'admin@company.local', 'admin', '11111111-1111-1111-1111-111111111111', 'active', '08:30'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Marcus', 'Lee', 'marcus@company.local', 'manager', '11111111-1111-1111-1111-111111111111', 'active', '08:00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Priya', 'Patel', 'priya@company.local', 'manager', '22222222-2222-2222-2222-222222222222', 'active', '08:00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Alicia', 'Nguyen', 'alicia@company.local', 'employee', '11111111-1111-1111-1111-111111111111', 'active', '08:30'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Erin', 'Gomez', 'erin@company.local', 'employee', '22222222-2222-2222-2222-222222222222', 'active', '09:00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Jonah', 'Brooks', 'jonah@company.local', 'employee', '22222222-2222-2222-2222-222222222222', 'active', '08:30'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'Sam', 'Carter', 'sam@company.local', 'employee', '11111111-1111-1111-1111-111111111111', 'active', '08:30')
on conflict (id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  role = excluded.role,
  team_id = excluded.team_id,
  status = excluded.status,
  expected_start_time = excluded.expected_start_time;

update public.teams
set manager_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
where id = '11111111-1111-1111-1111-111111111111';

update public.teams
set manager_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
where id = '22222222-2222-2222-2222-222222222222';

insert into public.app_users (profile_id, password_hash, must_set_password)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', crypt('ChangeMeNow123!', gen_salt('bf')), true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', crypt('ChangeMeNow123!', gen_salt('bf')), true)
on conflict (profile_id) do nothing;

insert into public.reminder_rules (id, reminder_type, enabled, send_time, timezone, team_id)
values
  ('33333333-3333-3333-3333-333333333331', 'punch_in', true, '08:45', 'America/Chicago', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333332', 'punch_out', true, '17:15', 'America/Chicago', null),
  ('33333333-3333-3333-3333-333333333333', 'missing_punch', true, '09:30', 'America/Chicago', null),
  ('33333333-3333-3333-3333-333333333334', 'outlook_oof', true, '08:00', 'America/Chicago', null)
on conflict (id) do nothing;
