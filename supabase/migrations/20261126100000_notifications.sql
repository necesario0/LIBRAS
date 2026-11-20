-- Notifications (spec #42, ticket #62): what a Member sees in the app's
-- notification inbox, from the bell on Home. The inbox has an entry for the
-- same four events a push notification is about: a Hold is ready, a Loan is due
-- tomorrow, a Loan is now overdue, and a new Announcement has started. It
-- needs no push setup, and the push switches never decide what it holds.
--
-- Two shapes, one for each kind of event:
--
-- - A Hold or a Loan event is the Member's own: one row in `notifications`,
--   written by the API when the event happens (once per Member and event, by
--   the unique key), with its words, what it opens, and when it was read.
-- - An Announcement reaches every Member, so it is not copied into a row per
--   Member: the API lists the Announcements themselves as the Member's entries,
--   and `announcement_reads` keeps which of them the Member has read.
--
-- Row-level security keeps each Member to their own rows, behind the API's own
-- checks: the API lists and marks as the Member. Only the API (as the owner)
-- writes a Notification. Both go with the Member's account.

create type public.notification_kind as enum ('hold_ready', 'loan_due_tomorrow', 'loan_overdue');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  kind public.notification_kind not null,
  -- The event within its kind, as `push_sends` names it: the Hold's id, or the Loan's id and due date.
  occasion text not null,
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 1000),
  -- What a tap opens: the Hold of a Hold ready, the Loan of a Loan notice.
  hold_id uuid references public.holds (id) on delete cascade,
  loan_id uuid references public.loans (id) on delete cascade,
  created_at timestamptz not null,
  read_at timestamptz,
  constraint notifications_once unique (member_id, kind, occasion),
  constraint notifications_opens check (
    case kind
      when 'hold_ready' then hold_id is not null and loan_id is null
      else loan_id is not null and hold_id is null
    end
  )
);

comment on table public.notifications is 'A Member''s Hold and Loan Notifications, one row per Member and event. Announcements are listed from public.announcements. Each Member reads and marks only their own rows.';
comment on column public.notifications.read_at is 'When the Member opened it or marked all as read; null while unread.';

-- A Member lists their Notifications newest first, and counts the unread ones.
create index notifications_member_idx on public.notifications (member_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (member_id) where read_at is null;

-- The Announcements a Member has read in the inbox. An Announcement without a
-- row here is unread for them.
create table public.announcement_reads (
  member_id uuid not null references public.members (user_id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null,
  primary key (member_id, announcement_id)
);

comment on table public.announcement_reads is 'Which Announcements each Member has read in the notification inbox. Each Member reads and adds only their own rows.';

create index announcement_reads_announcement_idx on public.announcement_reads (announcement_id);

alter table public.notifications enable row level security;
alter table public.announcement_reads enable row level security;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.announcement_reads from anon, authenticated;

-- A Member reads their own Notifications and marks them read. Nothing else
-- about a row can change, and only the API writes or deletes one.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create policy notifications_read_own on public.notifications
  for select to authenticated
  using (member_id = (select auth.uid()));

create policy notifications_mark_own on public.notifications
  for update to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

grant select, insert on table public.announcement_reads to authenticated;

create policy announcement_reads_read_own on public.announcement_reads
  for select to authenticated
  using (member_id = (select auth.uid()));

create policy announcement_reads_insert_own on public.announcement_reads
  for insert to authenticated
  with check (member_id = (select auth.uid()));
