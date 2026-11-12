import type { Database } from "../db.ts";
import { withTransaction } from "../db.ts";
import type { SampleCatalog } from "./catalog-generator.ts";

const BATCH_SIZE = 1_000;

export interface CatalogSeedResult {
  books: number;
  copies: number;
}

/**
 * Writes the sample catalog. Safe to run again: a Book is identified by its
 * ISBN and a Copy by its accession number, and rows that exist are left alone
 * (so a Copy that is on loan stays on loan). One transaction: all or nothing.
 * Returns how many Books and Copies the catalog holds, not how many were new.
 */
export async function seedCatalog(db: Database, catalog: SampleCatalog): Promise<CatalogSeedResult> {
  return withTransaction(db, async (client) => {
    let copies = 0;
    for (let start = 0; start < catalog.books.length; start += BATCH_SIZE) {
      const batch = catalog.books.slice(start, start + BATCH_SIZE);
      await client.query(
        `insert into public.books (title, authors, edition, publication_year, isbn, lc_call_number)
         select x.title, array(select jsonb_array_elements_text(x.authors)), x.edition, x."publicationYear", x.isbn, x."lcCallNumber"
           from jsonb_to_recordset($1::jsonb)
                as x(title text, authors jsonb, edition text, "publicationYear" int, isbn text, "lcCallNumber" text)
         on conflict (isbn) where isbn is not null do nothing`,
        [JSON.stringify(batch)],
      );
      const batchCopies = batch.flatMap((book) =>
        book.copies.map((copy) => ({ isbn: book.isbn, accessionNumber: copy.accessionNumber, barcode: copy.barcode })),
      );
      await client.query(
        `insert into public.copies (book_id, accession_number, barcode)
         select b.id, c."accessionNumber", c.barcode
           from jsonb_to_recordset($1::jsonb) as c(isbn text, "accessionNumber" text, barcode text)
           join public.books b on b.isbn = c.isbn
         on conflict (accession_number) do nothing`,
        [JSON.stringify(batchCopies)],
      );
      copies += batchCopies.length;
    }
    return { books: catalog.books.length, copies };
  });
}
