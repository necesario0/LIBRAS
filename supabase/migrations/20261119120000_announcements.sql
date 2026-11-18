-- Announcements (spec #42, ticket #50): a notice a Librarian publishes to every
-- Member as a poster image, shown on Home from the start of its first day to
-- the end of its last day, library time. Ending one early moves its end to now.
--
-- One at a time is the database's rule, not only the API's: the exclusion
-- constraint below refuses a row whose time range overlaps another's, so two
-- overlapping saves sent at the same moment cannot both succeed. The second
-- waits for the first to commit and is then refused (23P01).
--
-- The poster lives in Supabase Storage, in the public-read bucket
-- `announcements`, as two JPEGs in the Announcement's folder: the full poster
-- resized for phones (poster_path) and the 2:1 banner cut from it at
-- crop_position (banner_path), each `<id>/<random uuid>.jpg`. A new image or
-- crop is stored under new names and the old files are removed, so a cached old
-- file never shows for a new one. Only the API writes to the bucket (with the
-- secret key); no policy lets a client role write it.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text check (body is null or length(body) between 1 and 1000),
  -- One optional link: a Book of the catalog, or an https web page, never both.
  link_book_id uuid references public.books (id) on delete set null,
  link_url text check (link_url is null or (link_url like 'https://%' and length(link_url) <= 500)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Equal only for one ended at the very moment it started: it then never showed.
  check (ends_at >= starts_at),
  poster_path text not null check (poster_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  banner_path text not null check (banner_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  poster_width integer not null check (poster_width > 0),
  poster_height integer not null check (poster_height > 0),
  crop_position double precision not null check (crop_position between 0 and 1),
  created_by uuid not null references public.staff (user_id),
  created_at timestamptz not null,
  updated_by uuid not null references public.staff (user_id),
  updated_at timestamptz not null,
  constraint announcements_one_link check (link_book_id is null or link_url is null),
  constraint announcements_one_at_a_time exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);

comment on table public.announcements is 'Notices to every Member as a poster image, one at a time. Written by the API only, for Librarians.';
comment on column public.announcements.starts_at is 'The start of the first library day it shows.';
comment on column public.announcements.ends_at is 'The end of its last library day (exclusive), or the moment a Librarian ended it.';
comment on column public.announcements.poster_path is 'The full poster, resized for phones, in the announcements bucket.';
comment on column public.announcements.banner_path is 'The 2:1 banner cut from the poster at crop_position, in the announcements bucket.';
comment on column public.announcements.crop_position is 'Where the 2:1 banner sits on the poster, 0 (top or left) to 1 (bottom or right).';

-- The table is the API's alone: the client roles get nothing. A Member receives
-- the running Announcement through the API's Home endpoint.
alter table public.announcements enable row level security;
revoke all on table public.announcements from anon, authenticated;

-- The audit log records every create, edit, end and delete (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values
  ('announcement_created'),
  ('announcement_edited'),
  ('announcement_ended'),
  ('announcement_deleted');

-- The bucket. Public read (the app loads the images by address, with no
-- session), 5 MB at most, JPEG only: the API stores what it made, never the
-- upload. Without a policy on storage.objects for anon or authenticated, only
-- the secret key (the API) can write, replace or delete in it.
-- The storage schema exists on every hosted project and wherever the local
-- stack runs Storage (supabase/config.toml, [storage] enabled).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
