// Seeds the library's real catalog from its accession list: `npm run seed`
// (see `index.ts` for where the workbook is read from). Safe to run again: a
// Copy is identified by its accession number and rows that exist are left
// alone, so a Copy on loan stays on loan. One transaction: all or nothing.
import { randomUUID } from "node:crypto";
import { systemClock } from "../clock.ts";
import type { Clock } from "../clock.ts";
import type { Database, Tx } from "../db.ts";
import { withTransaction } from "../db.ts";
import { readLibraryWorkbook } from "./library-workbook.ts";
import type { ImportedBook, WorkbookReport } from "./library-workbook.ts";

const BATCH_SIZE = 1_000;

export interface LibraryCatalogSummary extends WorkbookReport {
  /** Books and Copies the workbook gives, whether new or already there. */
  books: number;
  copies: number;
  booksAdded: number;
  copiesAdded: number;
  /** Copies left out because another Copy in the database already has their barcode. */
  barcodeTaken: string[];
}

/** Reads the workbook at `path`, writes its Books and Copies, and logs a summary line by line. */
export async function seedLibraryCatalog(
  db: Database,
  path: string,
  log: (line: string) => void,
  clock: Clock = systemClock,
): Promise<LibraryCatalogSummary> {
  const workbook = await readLibraryWorkbook(path, clock.now());
  const written = await withTransaction(db, async (tx) => {
    const totals = { booksAdded: 0, copiesAdded: 0, barcodeTaken: [] as string[] };
    for (let start = 0; start < workbook.books.length; start += BATCH_SIZE) {
      const batch = await writeBatch(tx, workbook.books.slice(start, start + BATCH_SIZE));
      totals.booksAdded += batch.booksAdded;
      totals.copiesAdded += batch.copiesAdded;
      totals.barcodeTaken.push(...batch.barcodeTaken);
    }
    return totals;
  });
  const summary: LibraryCatalogSummary = {
    books: workbook.books.length,
    copies: workbook.books.reduce((sum, book) => sum + book.copies.length, 0),
    ...written,
    ...workbook.report,
  };
  for (const line of summaryLines(summary)) log(line);
  return summary;
}

async function writeBatch(tx: Tx, books: readonly ImportedBook[]): Promise<{ booksAdded: number; copiesAdded: number; barcodeTaken: string[] }> {
  const accessions = books.flatMap((book) => book.copies.map((copy) => copy.accessionNumber));
  const barcodes = books.flatMap((book) => book.copies.map((copy) => copy.barcode));
  const isbns = books.flatMap((book) => (book.isbn ? [book.isbn] : []));

  const existingCopies = await tx.query<{ accession_number: string; barcode: string; book_id: string }>(
    "select accession_number, barcode, book_id from public.copies where accession_number = any($1) or barcode = any($2)",
    [accessions, barcodes],
  );
  const bookOfAccession = new Map(existingCopies.rows.map((row) => [row.accession_number, row.book_id]));
  const accessionOfBarcode = new Map(existingCopies.rows.map((row) => [row.barcode, row.accession_number]));
  const existingBooks = await tx.query<{ id: string; isbn: string }>("select id, isbn from public.books where isbn = any($1)", [isbns]);
  const bookOfIsbn = new Map(existingBooks.rows.map((row) => [row.isbn, row.id]));

  const newBooks: (ImportedBook & { id: string })[] = [];
  const newCopies: { bookId: string; accessionNumber: string; barcode: string; receivedOn: string | null }[] = [];
  const barcodeTaken: string[] = [];
  for (const book of books) {
    const copies = book.copies.filter((copy) => !bookOfAccession.has(copy.accessionNumber));
    if (copies.length === 0) continue;
    const known =
      book.copies.map((copy) => bookOfAccession.get(copy.accessionNumber)).find((id) => id !== undefined) ??
      (book.isbn ? bookOfIsbn.get(book.isbn) : undefined);
    let bookId = known;
    for (const copy of copies) {
      const holder = accessionOfBarcode.get(copy.barcode);
      if (holder !== undefined && holder !== copy.accessionNumber) {
        barcodeTaken.push(copy.accessionNumber);
        continue;
      }
      if (bookId === undefined) {
        bookId = randomUUID();
        newBooks.push({ ...book, id: bookId });
      }
      newCopies.push({ bookId, accessionNumber: copy.accessionNumber, barcode: copy.barcode, receivedOn: copy.receivedOn });
    }
  }

  if (newBooks.length > 0) {
    await tx.query(
      `insert into public.books (id, title, authors, edition, publisher, publication_year, isbn, lc_call_number, summary, contents)
       select x.id, x.title, array(select jsonb_array_elements_text(x.authors)), x.edition, x.publisher, x."publicationYear",
              x.isbn, x."lcCallNumber", x.summary, x.contents
         from jsonb_to_recordset($1::jsonb) as x(id uuid, title text, authors jsonb, edition text, publisher text,
              "publicationYear" int, isbn text, "lcCallNumber" text, summary text, contents text)`,
      [JSON.stringify(newBooks.map(({ copies: _copies, ...book }) => book))],
    );
  }
  if (newCopies.length > 0) {
    await tx.query(
      `insert into public.copies (book_id, accession_number, barcode, received_on)
       select c."bookId", c."accessionNumber", c.barcode, c."receivedOn"
         from jsonb_to_recordset($1::jsonb) as c("bookId" uuid, "accessionNumber" text, barcode text, "receivedOn" date)`,
      [JSON.stringify(newCopies)],
    );
  }
  return { booksAdded: newBooks.length, copiesAdded: newCopies.length, barcodeTaken };
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
/** Names a few rows or accession numbers, so the summary stays short. */
const some = (items: readonly string[], shown = 10) => items.slice(0, shown).join(", ") + (items.length > shown ? `, and ${items.length - shown} more` : "");

/** The summary, in words. It names rows, accession numbers and call numbers only: never another column. */
export function summaryLines(summary: LibraryCatalogSummary): string[] {
  const lines = [
    `Library catalog: ${count(summary.books, "Book")} and ${count(summary.copies, "Copy", "Copies")} in the workbook ` +
      `(${count(summary.booksAdded, "Book")} and ${count(summary.copiesAdded, "Copy", "Copies")} new; existing ones left as they are)`,
  ];
  const skippedRows = summary.skipped.reduce((sum, group) => sum + group.rows.length, 0);
  lines.push(`Rows skipped: ${skippedRows}`);
  for (const group of summary.skipped) lines.push(`  ${group.reason}: ${group.rows.length} (${some(group.rows, 5)})`);
  if (summary.barcodeTaken.length > 0) {
    lines.push(`Copies left out because another Copy already has their barcode: ${summary.barcodeTaken.length} (${some(summary.barcodeTaken)})`);
  }
  if (!summary.legendFound) lines.push("The workbook has no LEGEND sheet, so its colours could not be read. Ask the project owner which rows are marked.");
  for (const { mark, accessionNumbers } of summary.marked) {
    lines.push(`Marked "${mark}" in the workbook, imported, check with the library: ${accessionNumbers.length} (${some(accessionNumbers)})`);
  }
  for (const { colour, accessionNumbers } of summary.unlistedColours) {
    lines.push(`Coloured ${colour}, a colour the legend does not list, imported, ask the project owner: ${accessionNumbers.length} (${some(accessionNumbers)})`);
  }
  const { missing, deweyStyle, likelyMistyped } = summary.callNumbers;
  lines.push(`Copies with no call number: ${missing}; with a Dewey-style call number: ${deweyStyle} (no Subject for these)`);
  const mistypedCopies = likelyMistyped.reduce((sum, entry) => sum + entry.copies, 0);
  lines.push(`Call numbers that look mistyped (pass to the librarian): ${mistypedCopies} Copies`);
  for (const { callNumber, copies } of likelyMistyped) lines.push(`  ${callNumber}${copies > 1 ? ` (${copies} Copies)` : ""}`);
  const { isbn, dateReceived, copyrightYear } = summary.unreadable;
  lines.push(`Values that could not be read and were left empty: ISBN ${isbn}, date received ${dateReceived}, copyright year ${copyrightYear}`);
  return lines;
}
