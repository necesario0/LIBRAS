-- Members and sign-up.
--
-- A Member has exactly one Account Type, fixed at sign-up. The account itself
-- (email, password, session) lives in Supabase Auth; this migration adds the
-- Member profile and the pending sign-ups that wait for an emailed code.

create type public.account_type as enum ('umak_student', 'faculty', 'ntp_employee', 'visitor', 'alumni');

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_type public.account_type not null,
  first_name text not null check (length(trim(first_name)) > 0),
  middle_name text,
  last_name text not null check (length(trim(last_name)) > 0),
  username text not null check (length(username) between 3 and 30),
  contact_number text,
  -- What only one Account Type gives at sign-up (a UMAK Student's student number and college).
  details jsonb not null default '{}'::jsonb,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint members_umak_student_details check (
    account_type <> 'umak_student' or (details ? 'studentNumber' and details ? 'college')
  )
);

comment on table public.members is 'Member profiles. Created by the API when a sign-up code is accepted, never by a client.';

create unique index members_username_key on public.members (lower(username));
create unique index members_student_number_key on public.members ((details ->> 'studentNumber'))
  where account_type = 'umak_student';

-- A sign-up that has not been verified yet. The auth account already exists but
-- is unconfirmed, so it cannot sign in. The code is stored as a salted hash.
create table public.signup_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Everything the person entered except email and password, as the API validated it.
  profile jsonb not null,
  terms_accepted_at timestamptz not null,
  code_salt text not null,
  code_hash text not null,
  code_sent_at timestamptz not null,
  code_expires_at timestamptz not null,
  -- Wrong guesses against the current code. The code stops working at the limit.
  failed_attempts integer not null default 0 check (failed_attempts >= 0)
);

comment on table public.signup_requests is 'Pending sign-ups waiting for an emailed code. Only the API reads and writes it.';

-- Row-level security is the second layer behind the API's own checks. The API
-- runs each signed-in request as the "authenticated" role with the person's
-- identity set, so these policies decide what that person can touch.
alter table public.members enable row level security;
alter table public.signup_requests enable row level security;

revoke all on table public.members from anon, authenticated;
revoke all on table public.signup_requests from anon, authenticated;

-- A Member reads their own profile and nobody else's. There is no insert,
-- update or delete for clients: the API writes Members as itself.
grant select on table public.members to authenticated;

create policy members_read_own on public.members
  for select
  to authenticated
  using (user_id = (select auth.uid()));
