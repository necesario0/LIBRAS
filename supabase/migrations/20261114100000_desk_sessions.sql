-- Desk sessions (ADR 0008): scanning a Member's Digital ID at the desk starts a
-- short-lived session for that Librarian and that Member, and every Copy scanned
-- for the Member during the visit is lent through it. The Digital ID changes every
-- 60 seconds and is accepted for at most two windows, so it cannot itself be sent
-- again with each Copy: a Copy scanned two minutes later would be refused.
--
-- The token the desk page holds is 32 random bytes; only its SHA-256 hash is
-- stored, so this table cannot be used to lend. A session ends at `expires_at`
-- (10 minutes after its last use, renewed on each use) or when the Librarian is
-- done with the Member (`ended_at`). Only the API reads or writes it.

create table public.desk_sessions (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  librarian_id uuid not null references public.staff (user_id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  -- All three times come from the API's clock.
  started_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz
);

comment on table public.desk_sessions is 'Desk sessions: a Librarian lends Copies to the Member whose Digital ID they scanned, for 10 minutes after the last use. Token hashes only. Only the API reads or writes it.';

-- Clearing out sessions that are over.
create index desk_sessions_expires_idx on public.desk_sessions (expires_at);

alter table public.desk_sessions enable row level security;
-- No grants and no policies: anon, authenticated and service_role get nothing.
revoke all on table public.desk_sessions from anon, authenticated, service_role;

-- A Digital ID code is now claimed for a Librarian when it is scanned at the
-- desk (it starts a desk session), not when a Loan is confirmed with it.
comment on table public.digital_id_uses is 'Digital ID codes scanned at the desk, and the Librarian who first scanned each: the same code is refused at any other desk. Only the API reads or writes it.';
