-- Library staff. Staff are not Members: a person in this table signs in to the
-- Librarian pages, and never has a Member profile.
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Role is the staff word for what Account Type is for Members. Tier 1 has Librarians only.
  role text not null check (role in ('librarian')),
  full_name text not null check (length(trim(full_name)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.staff is 'Library staff accounts (Librarians). Created by the seed script, never by sign-up.';

-- Row-level security is the second layer behind the API's own checks. The API
-- runs each signed-in request as the "authenticated" role with the person's
-- identity set, so these policies decide what that person can touch.
alter table public.staff enable row level security;

revoke all on table public.staff from anon, authenticated;
grant select on table public.staff to authenticated;

create policy staff_read_own on public.staff
  for select
  to authenticated
  using (user_id = (select auth.uid()));
