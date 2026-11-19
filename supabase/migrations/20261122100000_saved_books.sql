-- Saved books: a Member's private list of Books to find again. No queue, no Loan.
--
-- A Member saves a Book once (the primary key). A Saved book goes away with its
-- Member and with its Book. Row-level security keeps each Member to their own
-- rows, behind the API's own checks: the API reads and writes as the Member.

create table public.saved_books (
  member_id uuid not null references public.members (user_id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  saved_at timestamptz not null,
  primary key (member_id, book_id)
);

comment on table public.saved_books is 'Saved books: a Member''s private list. Each Member reads and changes only their own rows. Not written to the audit log.';

-- A Member lists their Saved books, newest first.
create index saved_books_member_idx on public.saved_books (member_id, saved_at desc);

alter table public.saved_books enable row level security;
revoke all on table public.saved_books from anon, authenticated;
grant select, insert, delete on table public.saved_books to authenticated;

create policy saved_books_read_own on public.saved_books
  for select to authenticated
  using (member_id = (select auth.uid()));

create policy saved_books_insert_own on public.saved_books
  for insert to authenticated
  with check (member_id = (select auth.uid()));

create policy saved_books_delete_own on public.saved_books
  for delete to authenticated
  using (member_id = (select auth.uid()));
