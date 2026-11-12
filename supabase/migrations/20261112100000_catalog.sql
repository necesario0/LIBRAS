-- The catalog: Books and their Copies.
--
-- A Book is a title and edition: what search finds and what a Hold is placed
-- on. A Copy is one physical item of a Book with its own accession number and
-- 1D barcode: what a Loan is for. Availability is derived from Copies, never
-- stored on the Book.

create type public.copy_status as enum (
  -- On the shelf and loanable.
  'available',
  -- Out with a Member on a Loan.
  'on_loan',
  -- Set aside for the Member whose Hold was chosen, for the Pickup Window.
  'set_aside'
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  -- One entry per author, written "Surname, Given".
  authors text[] not null default '{}',
  edition text,
  publication_year smallint check (publication_year between 1000 and 2999),
  isbn text,
  -- Library of Congress call number.
  lc_call_number text,
  created_at timestamptz not null default now()
);

comment on table public.books is 'Catalog titles. Written by the seed script and, later, the admin module; never by a Member.';

create unique index books_isbn_key on public.books (isbn) where isbn is not null;

create table public.copies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete restrict,
  accession_number text not null check (length(btrim(accession_number)) > 0),
  -- The 1D barcode printed on the Copy: what the Librarian scans.
  barcode text not null check (length(btrim(barcode)) > 0),
  status public.copy_status not null default 'available',
  created_at timestamptz not null default now()
);

comment on table public.copies is 'Physical items. `status` is changed by circulation (Loans, returns, Hold dispatch).';

create unique index copies_accession_number_key on public.copies (accession_number);
create unique index copies_barcode_key on public.copies (barcode);
create index copies_book_id_idx on public.copies (book_id, status);

-- Search keeps an immutable in-memory index of the catalog (ADR 0001). Every
-- change to what the index is built from bumps this counter, and the API
-- rebuilds and swaps its index when it sees a new value. A Copy changing
-- status does not matter to the index, so it does not bump it: availability
-- is read live.
create table public.catalog_revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0
);

insert into public.catalog_revision default values;

create function public.bump_catalog_revision() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  update public.catalog_revision set revision = revision + 1;
  return null;
end;
$$;

create trigger books_bump_catalog_revision
  after insert or update of title, authors, isbn, lc_call_number or delete on public.books
  for each statement execute function public.bump_catalog_revision();

create trigger copies_bump_catalog_revision
  after insert or update of accession_number, book_id or delete on public.copies
  for each statement execute function public.bump_catalog_revision();

-- Row-level security is the second layer behind the API's own checks. Any
-- signed-in person may read the catalog; nobody writes it through a client.
alter table public.books enable row level security;
alter table public.copies enable row level security;
alter table public.catalog_revision enable row level security;

revoke all on table public.books, public.copies, public.catalog_revision from anon, authenticated;
grant select on table public.books, public.copies to authenticated;

create policy books_read on public.books for select to authenticated using (true);
create policy copies_read on public.copies for select to authenticated using (true);
