-- Make audit_logs ergonomic for app-level auditing:
--  • entity_id nullable (some actions — settings, bulk ops — have no single row id)
--  • summary: human-readable one-line description shown in the audit viewer
alter table public.audit_logs alter column entity_id drop not null;
alter table public.audit_logs add column if not exists summary text;

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
