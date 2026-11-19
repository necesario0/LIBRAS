-- Sign out of all devices (spec #42, ticket #52): a Member ends every session
-- of their account from Settings. The audit log records each one
-- (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('signed_out_all_devices');
