import { HOME_SHELF_LENGTH, MOST_BORROWED_WINDOW_DAYS, arrangeCatalogResults, canBorrow, homeShelfCopy, isInLibraryOnlyAccount, memberCollege, subjectFor, topSubject, workKey } from "@libras/shared";
import type { BookSearchResult, HomeShelf, MemberProfile, Subject } from "@libras/shared";
import type { Clock } from "../clock.ts";
import type { Database } from "../db.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many shelf candidates have their Copies counted per query while filling the Available now shelf. */
const AVAILABILITY_CHUNK = 100;

/**
 * A Book as the shelves rank it: what a result row shows, plus when it was added to the catalog
 * and its work (`workKey`). Its Copy counts are filled in live, only for the Books a shelf shows.
 */
interface ShelfBook extends BookSearchResult {
  addedAt: number;
  work: string;
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
}

/** Loans per work (`workKey`), so the editions of one work add up. */
type WorkLoans = ReadonlyMap<string, number>;

/**
 * The catalog as the shelves need it, for one catalog revision: every Book with its work and
 * Subject, and the works folded newest first (per Subject on first use). Copy counts are not in
 * it: they change with every Loan, so they are read live.
 */
interface CatalogSnapshot {
  revision: string;
  books: ShelfBook[];
  /** Newest first, editions folded into their newest edition, for the whole catalog (key null) or one Subject. */
  foldedNewest: Map<Subject | null, ShelfBook[]>;
}

/**
 * The last snapshot per database, and the read in progress. The catalog changes rarely (the seed
 * inserts Books and Copies, which bumps `catalog_revision`), so Home reads it once per revision
 * instead of on every call. The API never edits a Book in place.
 */
const snapshots = new WeakMap<Database, { current?: CatalogSnapshot; loading?: Promise<CatalogSnapshot>; loadingRevision?: string }>();

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
 * The catalog comes from a snapshot read once per catalog revision. Copy counts (availability)
 * are read live, only for the Books the shelves show or consider.
 */
export async function homeShelves(deps: { db: Database; clock: Clock }, member: MemberProfile): Promise<HomeShelf[]> {
  const college = memberCollege(member);
  const mayBorrow = canBorrow(member.accountType);
  const inLibraryOnly = isInLibraryOnlyAccount(member.accountType);
  const since = new Date(deps.clock.now().getTime() - MOST_BORROWED_WINDOW_DAYS * DAY_MS);

  const [snapshot, collegeLoans, libraryLoans, borrowedSubjects] = await Promise.all([
    catalogSnapshot(deps.db),
    readLoansInWindow(deps.db, since, college),
    // A Member with no college has the whole library for both shelves: one read.
    college === null ? undefined : readLoansInWindow(deps.db, since, null),
    mayBorrow ? readBorrowedSubjects(deps.db, member.id) : Promise.resolve([]),
  ]);
  const subject = topSubject(borrowedSubjects);

  const newArrivals = foldedNewest(snapshot, null).slice(0, HOME_SHELF_LENGTH);
  const popular = foldMostBorrowed(snapshot.books, collegeLoans).slice(0, HOME_SHELF_LENGTH);
  const availableNow = await availableNowShelf(deps.db, snapshot, subject, libraryLoans ?? collegeLoans);
  const counted = await withCopyCounts(deps.db, [...newArrivals, ...popular]);

  const shelves: HomeShelf[] = [];
  const add = (shelf: Omit<HomeShelf, "books">, books: BookSearchResult[]) => {
    if (books.length > 0) shelves.push({ ...shelf, books });
  };
  add({ kind: "new_arrivals", ...homeShelfCopy({ kind: "new_arrivals" }) }, newArrivals.map((book) => counted(book)));
  add({ kind: "popular", ...homeShelfCopy({ kind: "popular", college }) }, popular.map((book) => counted(book)));
  add({ kind: "available_now", ...homeShelfCopy({ kind: "available_now", subject, canBorrow: mayBorrow, inLibraryOnly }) }, availableNow);
  return shelves;
}

/** The catalog snapshot for the current revision: the cached one, or one read now (shared by calls that arrive meanwhile). */
async function catalogSnapshot(db: Database): Promise<CatalogSnapshot> {
  // Read the revision before the Books: a change in between makes the snapshot newer than its
  // revision, never older, and the next call reads it again.
  const { rows } = await db.query<{ revision: string }>("select revision::text as revision from public.catalog_revision");
  const revision = rows[0]?.revision ?? "0";
  let entry = snapshots.get(db);
  if (entry === undefined) {
    entry = {};
    snapshots.set(db, entry);
  }
  if (entry.current?.revision === revision) return entry.current;
  if (entry.loading !== undefined && entry.loadingRevision === revision) return entry.loading;
  const state = entry;
  const loading = readSnapshot(db, revision).then(
    (snapshot) => {
      if (state.loading === loading) {
        state.current = snapshot;
        state.loading = undefined;
      }
      return snapshot;
    },
    (error: unknown) => {
      if (state.loading === loading) state.loading = undefined;
      throw error;
    },
  );
  state.loading = loading;
  state.loadingRevision = revision;
  return loading;
}

async function readSnapshot(db: Database, revision: string): Promise<CatalogSnapshot> {
  const { rows } = await db.query<BookRow>(
    "select id, title, authors, edition, publication_year, isbn, lc_call_number, created_at from public.books",
  );
  const books = rows.map(
    (row): ShelfBook => ({
      id: row.id,
      title: row.title,
      authors: row.authors,
      edition: row.edition,
      publicationYear: row.publication_year,
      isbn: row.isbn,
      lcCallNumber: row.lc_call_number,
      subject: subjectFor(row.lc_call_number),
      availableCopies: 0,
      totalCopies: 0,
      addedAt: row.created_at.getTime(),
      work: workKey(row.title, row.authors),
    }),
  );
  books.sort(newerFirst);
  return { revision, books, foldedNewest: new Map() };
}

/** Added later first; the same order the shelves always used for equal ranks. */
const newerFirst = (a: ShelfBook, b: ShelfBook) => b.addedAt - a.addedAt || a.id.localeCompare(b.id);

/** Folds Books already in rank order by edition, as search does; no availability filter. */
const fold = (ranked: readonly ShelfBook[]): ShelfBook[] =>
  arrangeCatalogResults(ranked, { sort: "best", availableNow: false, latestEditionOnly: true }).map((row) => row.book);

/** The catalog (or one Subject of it) newest first, folded; computed once per snapshot and Subject. */
function foldedNewest(snapshot: CatalogSnapshot, subject: Subject | null): ShelfBook[] {
  const known = snapshot.foldedNewest.get(subject);
  if (known !== undefined) return known;
  const folded = fold(subject === null ? snapshot.books : snapshot.books.filter((book) => book.subject === subject));
  snapshot.foldedNewest.set(subject, folded);
  return folded;
}

/**
 * The works borrowed in the window, most borrowed first (equal counts: the Book added last first),
 * folded. Only Books of borrowed works are sorted, which are few next to the catalog.
 */
function foldMostBorrowed(books: readonly ShelfBook[], loans: WorkLoans): ShelfBook[] {
  if (loans.size === 0) return [];
  const loansOf = (book: ShelfBook) => loans.get(book.work) ?? 0;
  const borrowed = books.filter((book) => loansOf(book) > 0);
  borrowed.sort((a, b) => loansOf(b) - loansOf(a) || newerFirst(a, b));
  return fold(borrowed);
}

/**
 * Available now: the Member's Subject (or the whole library), most borrowed works first, then the
 * rest newest first, folded, keeping the Books with a Copy on the shelf. The ranking is the same as
 * sorting every Book by Loans, then newest: a work's Loans are shared by all its editions, so the
 * borrowed works fold on their own and the rest fold in newest order. Copies are counted live, a
 * chunk of candidates at a time, until the shelf is full.
 */
async function availableNowShelf(db: Database, snapshot: CatalogSnapshot, subject: Subject | null, loans: WorkLoans): Promise<BookSearchResult[]> {
  const pool = subject === null ? snapshot.books : snapshot.books.filter((book) => book.subject === subject);
  const borrowed = foldMostBorrowed(pool, loans);
  const borrowedWorks = new Set(borrowed.map((book) => book.work));
  const rest = foldedNewest(snapshot, subject).filter((book) => !borrowedWorks.has(book.work));
  const candidates = [...borrowed, ...rest];

  const shelf: BookSearchResult[] = [];
  for (let start = 0; start < candidates.length && shelf.length < HOME_SHELF_LENGTH; start += AVAILABILITY_CHUNK) {
    const chunk = candidates.slice(start, start + AVAILABILITY_CHUNK);
    const counted = await withCopyCounts(db, chunk);
    for (const book of chunk) {
      const row = counted(book);
      if (row.availableCopies > 0) shelf.push(row);
      if (shelf.length === HOME_SHELF_LENGTH) break;
    }
  }
  return shelf;
}

/** Reads the Copy counts of `books` now, and returns a function giving each Book as a result row with them. */
async function withCopyCounts(db: Database, books: readonly ShelfBook[]): Promise<(book: ShelfBook) => BookSearchResult> {
  const ids = [...new Set(books.map((book) => book.id))];
  const counts = new Map<string, { total: number; available: number }>();
  if (ids.length > 0) {
    const { rows } = await db.query<{ book_id: string; total: number; available: number }>(
      `select book_id, count(*)::int as total, (count(*) filter (where status = 'available'))::int as available
         from public.copies
        where book_id = any($1::uuid[])
        group by book_id`,
      [ids],
    );
    for (const row of rows) counts.set(row.book_id, { total: row.total, available: row.available });
  }
  return ({ addedAt: _addedAt, work: _work, ...book }) => {
    const count = counts.get(book.id);
    return { ...book, totalCopies: count?.total ?? 0, availableCopies: count?.available ?? 0 };
  };
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
