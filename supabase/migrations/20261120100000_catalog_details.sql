-- Catalog details the library's accession list carries (#57): the publisher,
-- an optional summary and contents text on a Book, and the date a Copy was
-- received (what the New arrivals shelf reads).
--
-- None of these feed the search index, so the catalog revision triggers are
-- left as they are: search does not match words found only in a summary.

alter table public.books
  add column publisher text,
  -- Stored as the library wrote it, trimmed, plain text (never HTML).
  add column summary text check (summary is null or length(btrim(summary)) > 0),
  add column contents text check (contents is null or length(btrim(contents)) > 0);

alter table public.copies
  -- The library day the Copy arrived. Null when the accession list does not say.
  add column received_on date;

create index copies_received_on_idx on public.copies (received_on desc) where received_on is not null;
