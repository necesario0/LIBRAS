-- In-library Loans within library hours for Visitor and Alumni accounts.
--
-- Visitor and Alumni previously had loan_limit = 0 (cannot borrow). They may
-- now borrow up to 3 Copies at a time for same-day in-library use only during
-- library operating hours (Mon-Fri 8:00 AM - 7:00 PM, Sat 8:00 AM - 12:00 PM),
-- due at that day's closing time, with no Renewals (renewal_limit = 0) and no
-- Holds, and accrue the standard Fine if kept overdue past closing.

alter table public.loan_policies
  drop constraint loan_policies_period_when_borrowing,
  add column in_library_only boolean not null default false;

alter table public.loan_policies alter column in_library_only drop default;

alter table public.loan_policies
  add constraint loan_policies_period_when_borrowing
    check (loan_limit = 0 or in_library_only or loan_period_days is not null),
  add constraint loan_policies_in_library_same_day
    check (not in_library_only or (loan_period_days is null and renewal_limit = 0));

update public.loan_policies
   set loan_limit = 3,
       loan_period_days = null,
       in_library_only = true,
       renewal_limit = 0,
       fine_daily_rate_centavos = 500,
       fine_cap_centavos = 30000
 where account_type in ('visitor', 'alumni');

comment on table public.loan_policies is 'Loan Policy per Account Type: loan limit, loan period, in-library-only flag, renewal limit, daily Fine rate and Fine cap. A limit of zero means the Account Type cannot borrow.';
comment on column public.loan_policies.in_library_only is 'True when Copies may only be borrowed for same-day in-library use and are due at library closing time.';
