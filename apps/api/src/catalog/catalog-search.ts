import { buildCatalogIndex } from "@libras/shared";
import type { BookSearchResult, CatalogIndex, IndexedBook } from "@libras/shared";
import { withTransaction } from "../db.ts";
import type { Database } from "../db.ts";
import type { Logger } from "../logger.ts";

/** A built index and the catalog revision it was built from. */
interface Snapshot {
  revision: bigint;
  index: CatalogIndex;
}

export interface CatalogSearchOutcome {
  total: number;
  results: BookSearchResult[];
}

/**
 * Typo-tolerant catalog search for the API (ADR 0001).
 *
 * Holds one immutable `CatalogIndex` (the flat trie plus its postings). The
 * catalog table `catalog_revision` counts every change to what the index is
 * built from; each search reads it, and when it has moved the index is rebuilt
 * from one consistent snapshot of the database and the reference is swapped in
 * a single assignment. A search that already holds the old index finishes on
 * it, so a rebuild never fails or corrupts a search in flight. Searches that
 * start while the rebuild runs wait for it (all of them share one rebuild), so
 * a Book added a moment ago is found by the next search.
 *
 * Availability is not in the index: it is read from the Copies for the Books
 * that matched, so it is always current.
 */
export class CatalogSearch {
  readonly #db: Database;
  readonly #logger: Logger;
  #current: Snapshot | undefined;
  #rebuilding: Promise<Snapshot> | undefined;

  constructor(db: Database, logger: Logger) {
    this.#db = db;
    this.#logger = logger;
  }

  /** Builds the first index ahead of the first search. A failure is logged and the first search tries again. */
  async warm(): Promise<void> {
    try {
      await this.#fresh();
    } catch (error) {
      this.#logger.error("Could not build the catalog search index at startup", error);
    }
  }

  async search(query: string, limit: number): Promise<CatalogSearchOutcome> {
    const { index } = await this.#fresh();
    const { total, hits } = index.search(query, { limit });
    if (hits.length === 0) return { total, results: [] };

    const { rows } = await this.#db.query<BookRow>(
      `select b.id, b.title, b.authors, b.edition, b.publication_year, b.isbn, b.lc_call_number,
              count(c.id)::int as total_copies,
              (count(c.id) filter (where c.status = 'available'))::int as available_copies
         from public.books b
         left join public.copies c on c.book_id = b.id
        where b.id = any($1::uuid[])
        group by b.id`,
      [hits.map((hit) => hit.bookId)],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    // Keep the ranking. A Book deleted since the index was built is simply left out.
    const results = hits.flatMap((hit) => {
      const row = byId.get(hit.bookId);
      return row ? [toResult(row)] : [];
    });
    return { total, results };
  }

  /** The index for the catalog as it is now: the current one when nothing changed, else a freshly built one. */
  async #fresh(): Promise<Snapshot> {
    for (;;) {
      const current = this.#current;
      const { rows } = await this.#db.query<{ revision: string }>("select revision from public.catalog_revision");
      const revision = BigInt(rows[0]?.revision ?? 0);
      if (current && current.revision >= revision) return current;
      // One rebuild serves every search that arrives while it runs. If the catalog changed again after
      // that rebuild took its snapshot, go round once more so this search sees the change it read.
      this.#rebuilding ??= this.#rebuild().finally(() => {
        this.#rebuilding = undefined;
      });
      const built = await this.#rebuilding;
      if (built.revision >= revision) return built;
    }
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
    const built: Snapshot = { revision: snapshot.revision, index: buildCatalogIndex(indexed) };
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
