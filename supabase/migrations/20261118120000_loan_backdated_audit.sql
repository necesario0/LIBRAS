-- `npm run verify:hosted -- backdate` moves a test Member's open Loan back by
-- whole days for the demo on real phones, and the audit log records each move
-- (apps/api/src/audit/events.ts, spec #29 final review).
insert into public.audit_event_types (event_type) values ('loan_backdated');
