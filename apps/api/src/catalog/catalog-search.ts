import { MOST_BORROWED_WINDOW_DAYS, arrangeCatalogResults, buildCatalogIndexAsync, pickSuggestions } from "@libras/shared";
import type {
  BookDetail,
  BookSearchResult,
  CatalogIndex,
  CatalogSearchFilters,
  CatalogSearchRow,
  CatalogSuggestion,
  IndexedBook,
} from "@libras/shared";
import type { Clock } from "../clock.ts";
import { withTransaction } from "../db.ts";
import type { Database } from "../db.ts";
import type { Logger } from "../logger.ts";

/** How many best-matching Books suggestions are drawn from: enough for 5 distinct titles and authors. */
const SUGGEST_CANDIDATES = 30;

/** A built index and the catalog revision it was built from. */
interface Snapshot {
  revision: bigint;
  index: CatalogIndex;
}

export interface CatalogSearchOutcome {
  /** Rows after folding and Available now, before `limit`. */
  total: number;
  results: CatalogSearchRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Typo-tolerant catalog search for the API (ADR 0001).
 *
 * Holds one immutable `CatalogIndex` (the flat trie plus its postings). The
 * catalog table `catalog_revision` counts every change to what the index is
 * built from; each search reads it, and when it has moved the index is rebuilt
 * from one consistent snapshot of the database and the reference is swapped in
 * a single assignment. A search that already holds the old index finishes on
 * it, so a rebuild never fails or corrupts a search in flight, and searches
 * that start while it runs keep using the old index instead of waiting. The
 * cost is that a catalog change shows up in search results a moment later
 * (one rebuild, about a second at the benchmark scale), not instantly.
 *
 * Availability is not in the index: it is read from the Copies for the Books
 * that matched, so it is always current. So are the fields that fold editions
 * and order results (title, first author, publication year) and the Loan
 * counts for Most borrowed: every matched Book is read in one query, then
 * `arrangeCatalogResults` folds, filters and sorts, and only then is the page cut.
 */
export class CatalogSearch {
  readonly #db: Database;
  readonly #logger: Logger;
  readonly #clock: Clock;
  #current: Snapshot | undefined;
  #rebuilding: Promise<Snapshot> | undefined;

  constructor(db: Database, logger: Logger, clock: Clock) {
    this.#db = db;
    this.#logger = logger;
    this.#clock = clock;
  }

  /** Builds the first index ahead of the first search. A failure is logged and the first search tries again. */
  async warm(): Promise<void> {
    try {
      await this.#fresh();
    } catch (error) {
      this.#logger.error("Could not build the catalog search index at startup", error);
    }
  }

  /** Rebuilds the index from the catalog as it is now and waits for the swap. For callers that must see a change at once, such as end-to-end fixtures. */
  async refresh(): Promise<void> {
    await this.#startRebuild();
  }

  /** One Book with its Copy counts, summary and contents, read live from the database (not from the index), or undefined when there is no such Book. */
  async book(id: string): Promise<BookDetail | undefined> {
    const [rows, texts] = await Promise.all([
      this.#booksWithCopyCounts([id]),
      this.#db.query<{ summary: string | null; contents: string | null }>("select summary, contents from public.books where id = $1", [id]),
    ]);
    const row = rows[0];
    const text = texts.rows[0];
    return row && text ? { ...toResult(row), summary: text.summary, contents: text.contents } : undefined;
  }

  /**
   * The rows for `query`: editions of one work folded when `latestEditionOnly`, then only rows whose
   * shown edition has a Copy on the shelf when `availableNow`, in the order `sort` asks for. At most
   * `limit` rows; `total` counts them all.
   */
  async search(query: string, { limit, ...filters }: CatalogSearchFilters & { limit: number }): Promise<CatalogSearchOutcome> {
    const { index } = await this.#fresh();
    const { hits } = index.search(query);
    if (hits.length === 0) return { total: 0, results: [] };

    const ids = hits.map((hit) => hit.bookId);
    const [rows, loansInWindow] = await Promise.all([
      this.#booksWithCopyCounts(ids),
      filters.sort === "borrowed" ? this.#loansInWindow(ids) : undefined,
    ]);
    const byId = new Map(rows.map((row) => [row.id, toResult(row)]));
    // Best-match order. A Book deleted since the index was built is simply left out.
    const ranked = ids.flatMap((id) => byId.get(id) ?? []);
    const arranged = arrangeCatalogResults(ranked, { ...filters, loansInWindow });
    return {
      total: arranged.length,
      results: arranged.slice(0, limit).map(({ book, olderEditions }) => ({ ...book, olderEditions })),
    };
  }

  /**
   * Up to `limit` suggestions for a query still being typed: Book titles (each with its Book id)
   * and author names, from the same typo-tolerant index as `search`. Only the Books' titles and
   * authors are read, so no accession number, barcode or ISBN can reach a suggestion.
   */
  async suggest(query: string, limit: number): Promise<CatalogSuggestion[]> {
    const { index } = await this.#fresh();
    const { hits } = index.suggest(query, { limit: SUGGEST_CANDIDATES });
    if (hits.length === 0) return [];
    const { rows } = await this.#db.query<{ id: string; title: string; authors: string[] }>(
      "select id, title, authors from public.books where id = any($1::uuid[])",
      [hits.map((hit) => hit.bookId)],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    // Keep the ranking. A Book deleted since the index was built is simply left out.
    const matched = hits.flatMap((hit) => byId.get(hit.bookId) ?? []);
    return pickSuggestions(query, matched, limit);
  }

  /** How many Loans of each of these Books were confirmed in the Most borrowed window up to now. Books with none are left out. */
  async #loansInWindow(ids: readonly string[]): Promise<Map<string, number>> {
    const since = new Date(this.#clock.now().getTime() - MOST_BORROWED_WINDOW_DAYS * DAY_MS);
    const { rows } = await this.#db.query<{ book_id: string; loans: number }>(
      `select c.book_id, count(*)::int as loans
         from public.loans l
         join public.copies c on c.id = l.copy_id
        where l.checked_out_at > $2 and c.book_id = any($1::uuid[])
        group by c.book_id`,
      [ids, since],
    );
    return new Map(rows.map((row) => [row.book_id, row.loans]));
  }

  /** These Books (in no particular order) with how many Copies each has and how many are available, read live. */
  async #booksWithCopyCounts(ids: readonly string[]): Promise<BookRow[]> {
    const { rows } = await this.#db.query<BookRow>(
      `select b.id, b.title, b.authors, b.edition, b.publication_year, b.isbn, b.lc_call_number,
              count(c.id)::int as total_copies,
              (count(c.id) filter (where c.status = 'available'))::int as available_copies
         from public.books b
         left join public.copies c on c.book_id = b.id
        where b.id = any($1::uuid[])
        group by b.id`,
      [ids],
    );
    return rows;
  }

  /**
   * The index to search with. The first call builds it and waits. After that a
   * search never waits for a rebuild: when the catalog has changed, a rebuild
   * starts in the background (all searches share one) and searches keep using
   * the current index until the new one is swapped in.
   */
  async #fresh(): Promise<Snapshot> {
    const current = this.#current;
    if (!current) return this.#startRebuild();
    const { rows } = await this.#db.query<{ revision: string }>("select revision from public.catalog_revision");
    if (current.revision < BigInt(rows[0]?.revision ?? 0)) {
      this.#startRebuild().catch((error: unknown) => this.#logger.error("Could not rebuild the catalog search index", error));
    }
    return current;
  }

  #startRebuild(): Promise<Snapshot> {
    this.#rebuilding ??= this.#rebuild().finally(() => {
      this.#rebuilding = undefined;
    });
    return this.#rebuilding;
  }

  async #rebuild(): Promise<Snapshot> {
    // One repeatable-read snapshot, so the revision and the Books it describes agree.
    const snapshot = await withTransaction(this.#db, async (client) => {
      await client.query("set transaction isolation level repeatable read read only");
      const revision = await client.query<{ revision: string }>("select revision from public.catalog_revision");
      const books = await client.query<IndexRow>(
        `select b.id, b.title, b.authors, b.isbn, b.lc_call_number,
                coalesce(array_agg(c.accession_number) filter (where c.id is not null), '{}') as accession_numbers
           from public.books b
           left join public.copies c on c.book_id = b.id
          group by b.id
          order by b.title, b.id`,
      );
      return { revision: BigInt(revision.rows[0]?.revision ?? 0), books: books.rows };
    });
    const indexed: IndexedBook[] = snapshot.books.map((row) => ({
      id: row.id,
      title: row.title,
      authors: row.authors,
      isbn: row.isbn,
      callNumber: row.lc_call_number,
      accessionNumbers: row.accession_numbers,
    }));
    const built: Snapshot = { revision: snapshot.revision, index: await buildCatalogIndexAsync(indexed) };
    this.#current = built; // the atomic swap: one assignment
    this.#logger.info(`Catalog search index built: ${indexed.length} Books, ${built.index.tokenCount} words (revision ${built.revision})`);
    return built;
  }
}

interface IndexRow {
  id: string;
  title: string;
  authors: string[];
  isbn: string | null;
  lc_call_number: string | null;
  accession_numbers: string[];
}

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  edition: string | null;
  publication_year: number | null;
  isbn: string | null;
  lc_call_number: string | null;
  total_copies: number;
  available_copies: number;
}

function toResult(row: BookRow): BookSearchResult {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors,
    edition: row.edition,
    publicationYear: row.publication_year,
    isbn: row.isbn,
    lcCallNumber: row.lc_call_number,
    availableCopies: row.available_copies,
    totalCopies: row.total_copies,
  };
}
