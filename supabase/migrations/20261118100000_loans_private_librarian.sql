-- Which Librarian confirmed a Loan is for the audit log, not for the client
-- roles (spec #29 final review). A Member reads their own Loans through Supabase
-- directly, and must not learn a Librarian's id from them, as with the Fines'
-- fixed_by and settled_by (20261117200000_fine_settlement.sql).
--
-- Column privileges replace the table-wide select of the loans migration, so a
-- column added later is private until it is granted here. Only the API
-- (connected as postgres) reads confirmed_by. The row-level security policies
-- are unchanged: a Member still sees only their own rows, a Librarian all rows.
revoke select on table public.loans from authenticated;
grant select (id, copy_id, member_id, checked_out_at, due_at, returned_at, renewal_count)
  on table public.loans to authenticated;
