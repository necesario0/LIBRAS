-- Digital ID secrets, the Loan Policy per Account Type, and Librarians reading Members.
--
-- See docs/adr/0004 for how a Digital ID is derived and checked.

-- Loan Policy: the loan limit and loan period of each Account Type. Every Account
-- Type has exactly one row. The values below are placeholders until the library
-- confirms the real policy, which then replaces them as a data change.
create table public.loan_policies (
  account_type public.account_type primary key,
  loan_limit integer not null check (loan_limit >= 0),
  -- Null for an Account Type that cannot borrow (limit zero).
  loan_period_days integer check (loan_period_days > 0),
  constraint loan_policies_period_when_borrowing check (loan_limit = 0 or loan_period_days is not null)
);

comment on table public.loan_policies is 'Loan Policy per Account Type: loan limit and loan period. A limit of zero means the Account Type cannot borrow.';

insert into public.loan_policies (account_type, loan_limit, loan_period_days) values
  ('umak_student', 3, 7),
  ('faculty', 3, 7),
  ('ntp_employee', 3, 7),
  ('visitor', 0, null),
  ('alumni', 0, null);

alter table public.loan_policies enable row level security;
revoke all on table public.loan_policies from anon, authenticated;
-- The policy is not personal: any signed-in person may read it. Only the API changes it.
grant select on table public.loan_policies to authenticated;
create policy loan_policies_read on public.loan_policies
  for select
  to authenticated
  using (true);

-- Each Member's Digital ID: a fixed 6-digit number that names the Member, and a
-- random 32-byte secret from which the API derives the rotating part of the code.
-- The secret never leaves the API: no client role has any privilege on this table,
-- not even through row-level security, and no endpoint returns it.
create table public.digital_id_secrets (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  id_number text not null unique check (id_number ~ '^[0-9]{6}$'),
  secret bytea not null check (octet_length(secret) = 32),
  created_at timestamptz not null default now()
);

comment on table public.digital_id_secrets is 'Digital ID number and HMAC secret per Member. Only the API reads it; the secret never leaves the API.';

alter table public.digital_id_secrets enable row level security;
-- No grants and no policies: anon, authenticated and service_role get nothing.
revoke all on table public.digital_id_secrets from anon, authenticated, service_role;

-- The desk page shows a Librarian the Member whose Digital ID was scanned. A
-- Librarian may read Member profiles; a Member still reads only their own.
create policy members_read_staff on public.members
  for select
  to authenticated
  using (exists (select 1 from public.staff where staff.user_id = (select auth.uid())));
