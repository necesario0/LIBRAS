-- Loans: a record that a Member has a specific Copy out.
--
-- A Loan exists only once a Librarian confirms it at the desk: the API writes
-- it as itself, and no client role can insert, update or delete one. The Loan
-- is open until `returned_at` is set (the return ticket does that and frees the
-- Copy). Overdue is derived from `due_at`; nothing is stored for it.
--
-- Two rules are enforced here as well as in the API, so that requests arriving
-- at the same moment cannot break them:
--   * a Copy has at most one open Loan (the partial unique index below);
--   * the API locks the Member's row, then the Copy's row, before it counts the
--     Member's open Loans and reads the Copy's status. Any later writer that
--     needs both locks (returns, Hold dispatch) must take them in that order.

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  copy_id uuid not null references public.copies (id) on delete restrict,
  member_id uuid not null references public.members (user_id) on delete restrict,
  -- The Librarian who confirmed the Loan at the desk.
  confirmed_by uuid not null references public.staff (user_id) on delete restrict,
  -- All three times come from the API's clock.
  checked_out_at timestamptz not null,
  -- The end of the library day the Copy is due (Loan Policy loan period).
  due_at timestamptz not null,
  -- Null while the Copy is still out.
  returned_at timestamptz,
  constraint loans_due_after_checkout check (due_at > checked_out_at),
  constraint loans_returned_after_checkout check (returned_at is null or returned_at >= checked_out_at)
);

comment on table public.loans is 'Loans of Copies to Members. Written by the API when a Librarian confirms a Loan or records a return, never by a client. A Member reads only their own.';

-- A Copy is out with at most one Member at a time.
create unique index loans_one_open_per_copy on public.loans (copy_id) where returned_at is null;

-- Counting a Member's open Loans against their limit, and listing them.
create index loans_member_open_idx on public.loans (member_id, due_at) where returned_at is null;
create index loans_member_idx on public.loans (member_id, checked_out_at desc);

-- Row-level security is the second layer behind the API's own checks. A Member
-- reads their own Loans; a Librarian reads any (the desk shows a Member's Loans
-- against their limit). Nobody writes through a client.
alter table public.loans enable row level security;
revoke all on table public.loans from anon, authenticated;
grant select on table public.loans to authenticated;

create policy loans_read_own on public.loans
  for select
  to authenticated
  using (member_id = (select auth.uid()));

create policy loans_read_staff on public.loans
  for select
  to authenticated
  using (exists (select 1 from public.staff where staff.user_id = (select auth.uid())));

-- Which shown Digital ID code confirmed a Loan, and at whose desk (ADR 0004:
-- a Member and a 60-second window name one shown code). The Librarian who first
-- confirms a Loan with a code may confirm more Loans with it while it is still
-- accepted, so a Member borrows several Copies in one visit; the same code
-- presented to any other Librarian is refused as already used.
create table public.digital_id_uses (
  member_id uuid not null references public.members (user_id) on delete cascade,
  code_window bigint not null,
  librarian_id uuid not null,
  first_used_at timestamptz not null,
  primary key (member_id, code_window)
);

comment on table public.digital_id_uses is 'Digital ID codes that confirmed a Loan, and the Librarian who used each. Only the API reads or writes it.';

alter table public.digital_id_uses enable row level security;
-- No grants and no policies: anon, authenticated and service_role get nothing.
revoke all on table public.digital_id_uses from anon, authenticated, service_role;

-- The audit log records every confirmed Loan (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('loan_confirmed');
