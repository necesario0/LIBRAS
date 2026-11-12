-- Returns: a Librarian scans a Copy at the desk and the API closes its open
-- Loan (sets `loans.returned_at`) and frees the Copy, in one transaction.
-- Nothing in the schema changes: the Loan model from the loans migration
-- already holds everything a return needs. Only the audit log learns a new
-- event type (apps/api/src/audit/events.ts).

insert into public.audit_event_types (event_type) values ('copy_returned');
