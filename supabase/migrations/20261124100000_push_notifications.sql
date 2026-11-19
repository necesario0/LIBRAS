-- Push notifications (spec #42, ticket #54). A Member's phone gets a push
-- notification, through the Expo push service, when a Hold of theirs is ready,
-- a Loan is due tomorrow, a Loan is now overdue, or a new Announcement starts.
-- Each kind has its own switch.
--
-- Only the API reads and writes these tables (as their owner). No client role may.

-- One row per phone that gets push notifications: its Expo push token and the
-- Member signed in on it. A phone has one token, so a token registered again by
-- another Member moves to them. The row goes at sign-out, when the push
-- service reports the token invalid, at Sign out of all devices and with the
-- account (Delete my account).
create table public.push_devices (
  token text primary key,
  member_id uuid not null references public.members (user_id) on delete cascade,
  registered_at timestamptz not null
);

comment on table public.push_devices is 'The phones that get a Member''s push notifications: one row per Expo push token.';

create index push_devices_member_idx on public.push_devices (member_id, registered_at desc);

-- The Member's switches, one row per Member. The column defaults are the
-- product's defaults: Hold ready, Loan due tomorrow and Loan overdue on, Announcements off.
create table public.push_settings (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  hold_ready boolean not null default true,
  loan_due_tomorrow boolean not null default true,
  loan_overdue boolean not null default true,
  announcement boolean not null default false
);

comment on table public.push_settings is 'Which kinds of push notification each Member gets. Loan notice emails are sent whatever these say.';

-- Every Member has a row from the start, with the defaults.
insert into public.push_settings (member_id) select user_id from public.members on conflict do nothing;

create function public.add_push_settings() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.push_settings (member_id) values (new.user_id) on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.add_push_settings() from public, anon, authenticated;

create trigger members_add_push_settings
  after insert on public.members
  for each row execute function public.add_push_settings();

-- Every push notification sent, one row per Member and event, so the same event
-- is never pushed twice (a retried sweep, a second Loan notice email for the
-- same notice). The row is written before the push leaves: a push that fails
-- is not sent again.
--
-- `occasion` names the event within its kind: the Hold's id, the Loan's id and
-- due date, or the Announcement's id.
create type public.push_kind as enum ('hold_ready', 'loan_due_tomorrow', 'loan_overdue', 'announcement');

create table public.push_sends (
  member_id uuid not null references public.members (user_id) on delete cascade,
  kind public.push_kind not null,
  occasion text not null,
  sent_at timestamptz not null,
  constraint push_sends_pkey primary key (member_id, kind, occasion)
);

comment on table public.push_sends is 'Every push notification sent: one row per Member, kind and event. An event with a row is never pushed again.';

-- Push tickets whose delivery receipt the sweep has not read yet. Expo's
-- receipts say, some minutes after a send, whether Firebase Cloud Messaging
-- refused a token as no longer registered; the sweep then removes that token.
create table public.push_tickets (
  id text primary key,
  token text not null,
  sent_at timestamptz not null
);

comment on table public.push_tickets is 'Expo push tickets whose receipts are still to be read, to find tokens that are no longer valid.';

create index push_tickets_sent_idx on public.push_tickets (sent_at);

alter table public.push_devices enable row level security;
alter table public.push_settings enable row level security;
alter table public.push_sends enable row level security;
alter table public.push_tickets enable row level security;
revoke all on table public.push_devices from anon, authenticated;
revoke all on table public.push_settings from anon, authenticated;
revoke all on table public.push_sends from anon, authenticated;
revoke all on table public.push_tickets from anon, authenticated;
