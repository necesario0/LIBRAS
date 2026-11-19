import { HOME_SHELF_LENGTH, MOST_BORROWED_WINDOW_DAYS, arrangeCatalogResults, canBorrow, homeShelfCopy, memberCollege, subjectFor, topSubject, workKey } from "@libras/shared";
import type { BookSearchResult, HomeShelf, MemberProfile, Subject } from "@libras/shared";
import type { Clock } from "../clock.ts";
import type { Database } from "../db.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A Book as the shelves rank it: what a result row shows, plus when it was added to the catalog. */
interface ShelfBook extends BookSearchResult {
  addedAt: number;
}

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  edition: string | null;
  publication_year: number | null;
  isbn: string | null;
  lc_call_number: string | null;
  created_at: Date;
  total_copies: number;
  available_copies: number;
}

/** Loans per work (`workKey`), so the editions of one work add up. */
type WorkLoans = ReadonlyMap<string, number>;

/**
 * The shelves of Home for a Member, in the order Home shows them. A shelf with no Books is
 * left out. Every shelf holds at most `HOME_SHELF_LENGTH` Books and folds the editions of one
 * work into its newest edition (the same fold as search, `arrangeCatalogResults`).
 *
 * - New arrivals: the Books added to the catalog most recently, newest first.
 * - Popular: the Books most borrowed in the last `MOST_BORROWED_WINDOW_DAYS` days by Members of
 *   the Member's college; the whole library for a Member with no college. Editions of a work
 *   add up.
 * - Available now: Books whose shown edition has a Copy on the shelf, in the Subject the Member
 *   has borrowed most, most borrowed first (by every Member). A Member who cannot borrow, or who
 *   has no Loans yet (or none of a Book with a Subject), gets the whole library instead.
 *
 * The catalog is read once per call (every Book, with its Copy counts), because folding by
 * edition needs every edition of a work. Availability is read live, as search does.
 */
export async function homeShelves(deps: { db: Database; clock: Clock }, member: MemberProfile): Promise<HomeShelf[]> {
  const college = memberCollege(member);
  const borrower = canBorrow(member.accountType);
  const since = new Date(deps.clock.now().getTime() - MOST_BORROWED_WINDOW_DAYS * DAY_MS);

  const [books, collegeLoans, libraryLoans, borrowedSubjects] = await Promise.all([
    readCatalog(deps.db),
    readLoansInWindow(deps.db, since, college),
    // A Member with no college has the whole library for both shelves: one read.
    college === null ? undefined : readLoansInWindow(deps.db, since, null),
    borrower ? readBorrowedSubjects(deps.db, member.id) : Promise.resolve([]),
  ]);
  const subject = topSubject(borrowedSubjects);
  const inSubject = subject === null ? books : books.filter((book) => book.subject === subject);

  const shelves: HomeShelf[] = [];
  const add = (shelf: Omit<HomeShelf, "books">, books: ShelfBook[]) => {
    if (books.length > 0) shelves.push({ ...shelf, books: books.map(publicBook) });
  };
  add({ kind: "new_arrivals", ...homeShelfCopy({ kind: "new_arrivals" }) }, shelfOf(newestFirst(books), false));
  add(
    { kind: "popular", ...homeShelfCopy({ kind: "popular", college }) },
    shelfOf(mostBorrowed(books, collegeLoans).filter((book) => loansOf(book, collegeLoans) > 0), false),
  );
  add(
    { kind: "available_now", ...homeShelfCopy({ kind: "available_now", subject, canBorrow: borrower }) },
    shelfOf(mostBorrowed(inSubject, libraryLoans ?? collegeLoans), true),
  );
  return shelves;
}

const loansOf = (book: ShelfBook, loans: WorkLoans): number => loans.get(workKey(book.title, book.authors)) ?? 0;

const newestFirst = (books: readonly ShelfBook[]): ShelfBook[] => [...books].sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id));

/** Most borrowed work first (its editions together); equal counts go to the Book added last. */
const mostBorrowed = (books: readonly ShelfBook[], loans: WorkLoans): ShelfBook[] =>
  [...books].sort((a, b) => loansOf(b, loans) - loansOf(a, loans) || b.addedAt - a.addedAt || a.id.localeCompare(b.id));

/** Folds the ranked Books by edition, keeps the rows with a Copy on the shelf when asked, and cuts the shelf. */
function shelfOf(ranked: readonly ShelfBook[], availableNow: boolean): ShelfBook[] {
  return arrangeCatalogResults(ranked, { sort: "best", availableNow, latestEditionOnly: true })
    .slice(0, HOME_SHELF_LENGTH)
    .map((row) => row.book);
}

function publicBook({ addedAt: _addedAt, ...book }: ShelfBook): BookSearchResult {
  return book;
}

async function readCatalog(db: Database): Promise<ShelfBook[]> {
  const { rows } = await db.query<BookRow>(
    `select b.id, b.title, b.authors, b.edition, b.publication_year, b.isbn, b.lc_call_number, b.created_at,
            count(c.id)::int as total_copies,
            (count(c.id) filter (where c.status = 'available'))::int as available_copies
       from public.books b
       left join public.copies c on c.book_id = b.id
      group by b.id`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    authors: row.authors,
    edition: row.edition,
    publicationYear: row.publication_year,
    isbn: row.isbn,
    lcCallNumber: row.lc_call_number,
    subject: subjectFor(row.lc_call_number),
    availableCopies: row.available_copies,
    totalCopies: row.total_copies,
    addedAt: row.created_at.getTime(),
  }));
}

/**
 * Loans confirmed since `since`, counted per work by Members of `college`, or by every Member when
 * `college` is null. The college is read from `members.details`.
 */
async function readLoansInWindow(db: Database, since: Date, college: string | null): Promise<Map<string, number>> {
  const { rows } = await db.query<{ title: string; authors: string[]; loans: number }>(
    `select b.title, b.authors, count(*)::int as loans
       from public.loans l
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
       join public.members m on m.user_id = l.member_id
      where l.checked_out_at > $1 and ($2::text is null or m.details ->> 'college' = $2)
      group by b.id`,
    [since, college],
  );
  const loans = new Map<string, number>();
  for (const row of rows) {
    const key = workKey(row.title, row.authors);
    loans.set(key, (loans.get(key) ?? 0) + row.loans);
  }
  return loans;
}

/** The Subject of the Book of each Loan the Member ever had (null when the Book has none). */
async function readBorrowedSubjects(db: Database, memberId: string): Promise<Array<Subject | null>> {
  const { rows } = await db.query<{ lc_call_number: string | null }>(
    `select b.lc_call_number
       from public.loans l
       join public.copies c on c.id = l.copy_id
       join public.books b on b.id = c.book_id
      where l.member_id = $1`,
    [memberId],
  );
  return rows.map((row) => subjectFor(row.lc_call_number));
}
