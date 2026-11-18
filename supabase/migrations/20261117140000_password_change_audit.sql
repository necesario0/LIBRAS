-- Change password (spec #29, ticket #34): a signed-in Member changes their
-- password. The audit log records every change and every wrong current
-- password (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('password_changed'), ('password_change_failed');
