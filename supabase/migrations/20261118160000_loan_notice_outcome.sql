-- A Loan notice email whose outcome is unknown (spec #29 final review): the
-- email service did not answer in time, so it may have accepted the email or
-- not. Sending again on the next tick would mail the Member again every few
-- minutes while the service stays slow, so the API keeps the email's row for
-- the library day, marked 'unknown', and writes no notice rows. The row stops
-- every later tick of that day; the next library day's run finds the notices
-- still unsent and sends those still due once (ADR 0009).
--
-- 'accepted': the email service accepted the email, and its notices have rows.

alter table public.loan_notice_emails
  add column outcome text not null default 'accepted' check (outcome in ('accepted', 'unknown'));

comment on column public.loan_notice_emails.outcome is 'accepted: the email service accepted it. unknown: it did not answer in time; the notices were not recorded and are tried again the next library day.';
comment on column public.loan_notice_emails.sent_at is 'When the API sent it, by the API''s clock: accepted by the email service, or (outcome unknown) given up waiting.';
comment on table public.loan_notice_emails is 'One row per Loan notice email: at most one per Member and library day. Written by the API once the email sender accepted the email, or gave up waiting for an answer.';
