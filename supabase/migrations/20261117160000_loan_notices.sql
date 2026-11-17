-- Loan notices (spec #29, ticket #35, ADR 0009): emails that tell a Member a
-- Loan is due tomorrow, is now overdue, or is still overdue (every 7 days after
-- the first overdue day, at most 4 times).
--
-- The API sends them on the sweep tick (ADR 0007). A notice is sent when it has
-- no row here, and its row is written in the same transaction that holds the
-- email's row, which commits only after the email sender accepted the email. A
-- failed send therefore leaves no row and the next tick tries again.
--
-- A Member gets at most one email a library day, covering every Loan that
-- needs a notice: `loan_notice_emails` holds one row per Member and library
-- day. A second tick at the same moment waits on that unique row until the
-- first commits (and then sends nothing) or rolls back (and then sends).
--
-- Neither table is read by a client. Notices are not written to the audit log.

create type public.loan_notice_kind as enum ('due_tomorrow', 'now_overdue', 'still_overdue');

create table public.loan_notice_emails (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  -- The library day (UTC+8) the email went out on.
  library_day date not null,
  -- When the email sender accepted it, by the API's clock.
  sent_at timestamptz not null,
  constraint loan_notice_emails_one_per_member_and_day unique (member_id, library_day)
);

comment on table public.loan_notice_emails is 'One row per Loan notice email: at most one per Member and library day. Written by the API only after the email sender accepted the email.';

create table public.loan_notices (
  loan_id uuid not null references public.loans (id) on delete cascade,
  kind public.loan_notice_kind not null,
  -- The due date the notice was about. A Renewal moves `loans.due_at`, so the Loan gets a fresh set of notices.
  due_at timestamptz not null,
  -- 0 for due tomorrow and now overdue; 1 to 4 for the still-overdue repeats.
  repeat smallint not null,
  email_id uuid not null references public.loan_notice_emails (id) on delete cascade,
  constraint loan_notices_pkey primary key (loan_id, kind, due_at, repeat),
  constraint loan_notices_repeat_of_kind check (
    (kind = 'still_overdue' and repeat between 1 and 4) or (kind <> 'still_overdue' and repeat = 0)
  )
);

comment on table public.loan_notices is 'Every Loan notice sent: one row per Loan, kind, due date and repeat number. A notice with no row has not been sent.';

create index loan_notices_email_idx on public.loan_notices (email_id);

-- The job reads the current Loans whose due date is within about five weeks of now.
create index loans_open_due_idx on public.loans (due_at) where returned_at is null;

-- The API alone reads and writes them (as the table owner). No client role may.
alter table public.loan_notice_emails enable row level security;
alter table public.loan_notices enable row level security;
revoke all on table public.loan_notice_emails from anon, authenticated;
revoke all on table public.loan_notices from anon, authenticated;
