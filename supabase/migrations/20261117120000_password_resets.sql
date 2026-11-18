-- Forgot password (spec #29, ticket #33): a Member asks for a code by email,
-- enters it, and sets a new password through Supabase Auth.
--
-- One row per email that asked for a code, whether or not the email belongs to
-- a Member. An email with no Member gets a row with no user and no code, so
-- every email is treated alike: the same reply, the same count of wrong codes,
-- the same expiry. Nobody can tell from the API's answers whether an email has
-- an account. The code itself is never stored, only its salted hash.
--
-- The API deletes a row once its code is used, and rows that expired more than
-- a day ago whenever a code is requested, so the table stays small.

create table public.password_resets (
  -- Lowercased, as the API reads it.
  email text primary key check (email = lower(email) and length(email) between 3 and 320),
  -- The Member the code is for. Null when the email has no Member account: no code was sent.
  user_id uuid references auth.users (id) on delete cascade,
  code_salt text,
  code_hash text,
  code_sent_at timestamptz not null,
  code_expires_at timestamptz not null,
  -- Wrong guesses against the current code. The code stops working at the limit.
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  constraint password_resets_code_with_user check (
    (user_id is null and code_salt is null and code_hash is null)
    or (user_id is not null and code_salt is not null and code_hash is not null)
  )
);

create index password_resets_expiry on public.password_resets (code_expires_at);

comment on table public.password_resets is 'Forgot password codes waiting to be used, one per email. Only the API reads and writes it.';

alter table public.password_resets enable row level security;
revoke all on table public.password_resets from anon, authenticated;

-- The audit log records every reset (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('password_reset');
