import type { SavedBook } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";

/** Postgres error code for a foreign key that points at nothing. */
const FOREIGN_KEY_VIOLATION = "23503";

interface SavedBookRow {
  book_id: string;
  title: string;
  authors: string[];
  saved_at: Date;
  total_copies: number;
  available_copies: number;
}

/**
 * The Member's Saved books, newest first, with each Book's availability read
 * live from its Copies. Read as the Member, so row-level security shows nobody
 * else's.
 */
export async function listSavedBooks(deps: AppDeps, identity: Identity): Promise<SavedBook[]> {
  const rows = await withIdentity(deps.db, identity, async (scope) => {
    const result = await scope.query<SavedBookRow>(
      `select s.book_id, b.title, b.authors, s.saved_at,
              count(c.id)::int as total_copies,
              (count(c.id) filter (where c.status = 'available'))::int as available_copies
         from public.saved_books s
         join public.books b on b.id = s.book_id
         left join public.copies c on c.book_id = b.id
        group by s.book_id, s.member_id, s.saved_at, b.id
        order by s.saved_at desc, b.title, s.book_id`,
    );
    return result.rows;
  });
  return rows.map((row) => ({
    bookId: row.book_id,
    title: row.title,
    authors: row.authors,
    availableCopies: row.available_copies,
    totalCopies: row.total_copies,
    savedAt: row.saved_at.toISOString(),
  }));
}

/**
 * Saves the Book for the Member. Saving again changes nothing (the first time
 * stays). Returns false when there is no such Book.
 */
export async function saveBook(deps: AppDeps, identity: Identity, bookId: string): Promise<boolean> {
  try {
    await withIdentity(deps.db, identity, (scope) =>
      scope.query(
        "insert into public.saved_books (member_id, book_id, saved_at) values ($1, $2, $3) on conflict do nothing",
        [identity.userId, bookId, deps.clock.now()],
      ),
    );
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === FOREIGN_KEY_VIOLATION) return false;
    throw error;
  }
}

/** Takes the Book off the Member's list. Succeeds when it was not there. */
export async function removeSavedBook(deps: AppDeps, identity: Identity, bookId: string): Promise<void> {
  await withIdentity(deps.db, identity, (scope) => scope.query("delete from public.saved_books where book_id = $1", [bookId]));
}

/** Whether the Member has saved the Book. */
export async function isBookSaved(deps: AppDeps, identity: Identity, bookId: string): Promise<boolean> {
  const rows = await withIdentity(deps.db, identity, async (scope) => (await scope.query("select 1 from public.saved_books where book_id = $1", [bookId])).rows);
  return rows.length > 0;
}
