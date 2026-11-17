-- Fines (spec #29, ticket #36, ADR 0010): the peso amount a Member owes for
-- one Loan returned late.
--
-- The Loan Policy gains a daily Fine rate and a Fine cap per Account Type, in
-- centavos so that a rate like PHP 2.50 needs no fractions. The seeded PHP 5 a
-- day and PHP 300 are placeholders until the library confirms the real policy,
-- which then replaces them as a data change. Visitor and Alumni cannot borrow,
-- so theirs are zero.
--
-- While a Loan is out and overdue, the API computes its Fine from the clock and
-- the current Loan Policy: the daily rate for every calendar day (UTC+8) after
-- the due date, up to the cap. Nothing is stored for it. At the return, the API
-- writes the final amount here, in the transaction that closes the Loan, and it
-- never changes again: a later change of the rate or the cap does not touch it.
-- The rate and cap it was worked out with are kept beside it. A Loan returned
-- on time, or late under a rate of zero, has no Fine.
--
-- Loans returned before this migration have no Fine: Tier 1 charged nothing.
--
-- Settling a Fine (paid or waived, by which Librarian, when) is ticket #37.

alter table public.loan_policies
  add column fine_daily_rate_centavos integer not null default 0 check (fine_daily_rate_centavos >= 0),
  add column fine_cap_centavos integer not null default 0 check (fine_cap_centavos >= 0);

update public.loan_policies
   set fine_daily_rate_centavos = 500, fine_cap_centavos = 30000
 where account_type in ('umak_student', 'faculty', 'ntp_employee');

-- Every row now has its values; a new Account Type must state its own.
alter table public.loan_policies alter column fine_daily_rate_centavos drop default;
alter table public.loan_policies alter column fine_cap_centavos drop default;

comment on table public.loan_policies is 'Loan Policy per Account Type: loan limit, loan period, renewal limit, daily Fine rate and Fine cap. A limit of zero means the Account Type cannot borrow.';
comment on column public.loan_policies.fine_daily_rate_centavos is 'The Fine for each calendar day a Loan is overdue, in centavos (500 = PHP 5).';
comment on column public.loan_policies.fine_cap_centavos is 'The most one Loan''s Fine can reach, in centavos (30000 = PHP 300).';

-- A Fine names its Loan and that Loan's Member: the pair must match a Loan.
alter table public.loans add constraint loans_id_member_unique unique (id, member_id);

create table public.fines (
  loan_id uuid primary key,
  member_id uuid not null,
  -- Calendar days after the due date, the day of the return included.
  days_late integer not null check (days_late > 0),
  -- The Loan Policy it was worked out with, at the return.
  daily_rate_centavos integer not null check (daily_rate_centavos > 0),
  cap_centavos integer not null check (cap_centavos >= 0),
  -- min(days_late * daily_rate_centavos, cap_centavos).
  amount_centavos integer not null check (amount_centavos > 0),
  -- When the return fixed it, by the API's clock: the Loan's returned_at.
  fixed_at timestamptz not null,
  constraint fines_amount_by_policy check (amount_centavos = least(days_late * daily_rate_centavos, cap_centavos)),
  constraint fines_loan_fk foreign key (loan_id, member_id) references public.loans (id, member_id) on delete cascade
);

comment on table public.fines is 'The Fine of each Loan returned late, fixed at the return and never changed. Written by the API only. A Member reads only their own.';

-- A Member's Fines, for My Loans, the Profile account screen and the desk.
create index fines_member_idx on public.fines (member_id);

-- Row-level security is the second layer behind the API's own checks, as for
-- Loans: a Member reads their own Fines, a Librarian reads any (the desk shows
-- a Member's unsettled Fines). Nobody writes through a client.
alter table public.fines enable row level security;
revoke all on table public.fines from anon, authenticated;
grant select on table public.fines to authenticated;

create policy fines_read_own on public.fines
  for select
  to authenticated
  using (member_id = (select auth.uid()));

create policy fines_read_staff on public.fines
  for select
  to authenticated
  using (exists (select 1 from public.staff where staff.user_id = (select auth.uid())));

-- The audit log records every Fine fixed at a return (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('fine_fixed');
