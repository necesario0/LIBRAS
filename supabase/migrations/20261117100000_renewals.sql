-- Renewals: a Member moves the due date of one of their own Loans later, in the
-- app, without a Librarian (spec #29, ticket #31).
--
-- The Loan Policy gains a renewal limit per Account Type: how many times one
-- Loan may be renewed. The value is a placeholder until the library confirms
-- the real policy, which then replaces it as a data change. Each Loan counts
-- the Renewals it has had; a Renewal adds one loan period to `due_at`.
--
-- The API refuses a Renewal when the Loan is overdue, when it has used its
-- renewal limit, or when another Member's Hold on the Book is waiting. It locks
-- the Member's row, then the Copy's row (the order every writer keeps, see the
-- Loans migration) before it reads the Loan and the Book's Holds, so a Hold
-- placed at the same moment (which reads the Book's Copies `for share`) either
-- comes first and refuses the Renewal, or waits until the Renewal is done.

alter table public.loan_policies
  add column renewal_limit integer not null default 1 check (renewal_limit >= 0);
-- Every row now has its value; a new Account Type must state its own.
alter table public.loan_policies alter column renewal_limit drop default;

comment on table public.loan_policies is 'Loan Policy per Account Type: loan limit, loan period and renewal limit. A limit of zero means the Account Type cannot borrow.';
comment on column public.loan_policies.renewal_limit is 'How many times one Loan of this Account Type may be renewed. Each Renewal adds one loan period.';

alter table public.loans
  add column renewal_count integer not null default 0 check (renewal_count >= 0);

comment on column public.loans.renewal_count is 'How many times the Member has renewed this Loan. `due_at` is the current due date, after every Renewal.';

-- The audit log records every Renewal (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('loan_renewed');
