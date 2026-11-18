-- Forgot password limits per email that outlast a restart of the API (spec #29
-- final review). The free host restarts the API often, and an in-memory count
-- starts again each time, so the two limits on one email live here:
--   * code requests: how many codes an email may ask for in a window;
--   * wrong codes: how many wrong codes an email may enter in a window, across
--     codes. A new code resets the wrong guesses against that code
--     (password_resets.failed_attempts), but not this count, so asking for a
--     new code again and again gives no more guesses.
-- Every email is counted alike, with or without an account, as in
-- password_resets. The API deletes rows older than the longest window whenever
-- a code is requested, so the table stays small.

create table public.password_reset_attempts (
  -- Lowercased, as the API reads it.
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  kind text not null check (kind in ('code_requested', 'wrong_code')),
  occurred_at timestamptz not null
);

create index password_reset_attempts_email on public.password_reset_attempts (email, kind, occurred_at);
create index password_reset_attempts_age on public.password_reset_attempts (occurred_at);

comment on table public.password_reset_attempts is 'Forgot password code requests and wrong codes per email, for the limits. Only the API reads and writes it.';

alter table public.password_reset_attempts enable row level security;
revoke all on table public.password_reset_attempts from anon, authenticated;
