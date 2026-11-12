-- Holds: a Member's place in the queue for a Book that has no available Copy.
--
-- The table is shaped for the Role-Weighted Priority Queue Dispatcher of ADR 0001
-- (the dispatch ticket adds the Copy and Pickup Window columns it needs):
--   placed_at     arrival time, by the API's clock
--   weight_hours  the Account Type's weight when the Hold was placed
--                 (Faculty 24, NTP / Employee 12, UMAK Student 0)
--   score         placed_at minus the weight: the lower, the sooner it is served
--   seq           arrival order, to break ties between equal scores
-- The queue of a Book is its waiting Holds ordered by (score, seq); there is no
-- in-memory copy of it.

create type public.hold_status as enum ('waiting', 'ready', 'fulfilled', 'expired', 'cancelled');

create table public.holds (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete restrict,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status public.hold_status not null default 'waiting',
  placed_at timestamptz not null,
  weight_hours integer not null check (weight_hours >= 0),
  score timestamptz not null,
  seq bigint generated always as identity,
  cancelled_at timestamptz,
  constraint holds_score_is_placed_at_minus_weight check (score = placed_at - make_interval(hours => weight_hours)),
  constraint holds_cancelled_at_when_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table public.holds is 'Holds on Books. Written by the API (placing, cancelling, dispatch), never by a client. A Member reads only their own.';

-- At most one active Hold per Member per Book. Enforced by the database, so two
-- requests at once cannot both succeed.
create unique index holds_one_active_per_member_and_book on public.holds (member_id, book_id)
  where status in ('waiting', 'ready');

-- The dispatch query: the waiting Holds of one Book in priority order.
create index holds_queue_idx on public.holds (book_id, score, seq) where status = 'waiting';

-- A Member lists their own Holds.
create index holds_member_idx on public.holds (member_id, placed_at desc);

-- Row-level security is the second layer behind the API's own checks. A Member
-- reads their own Holds and nobody else's; there is no insert, update or delete
-- for clients: the API writes Holds as itself.
alter table public.holds enable row level security;
revoke all on table public.holds from anon, authenticated;
grant select on table public.holds to authenticated;

create policy holds_read_own on public.holds
  for select
  to authenticated
  using (member_id = (select auth.uid()));
