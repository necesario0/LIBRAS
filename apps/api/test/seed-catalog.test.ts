import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { generateCatalog } from "../src/seed/catalog-generator.ts";
import { seedCatalog } from "../src/seed/catalog.ts";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("seeding the catalog", () => {
  let api: TestApi;
  // A small catalog from its own seed, so it does not collide with the full sample catalog or with other tests.
  const catalog = generateCatalog({ seed: 777_001, searchTokens: 400 });
  const isbns = catalog.books.map((book) => book.isbn);
  const accessions = catalog.books.flatMap((book) => book.copies.map((copy) => copy.accessionNumber));

  before(async () => {
    api = await startTestApi();
  });
  after(async () => {
    await api.db.query("delete from public.copies where accession_number = any($1)", [accessions]);
    await api.db.query("delete from public.books where isbn = any($1)", [isbns]);
    await api.close();
  });

  it("creates Books with their Copies, accession numbers and barcodes", async () => {
    const result = await seedCatalog(api.db, catalog);
    assert.equal(result.books, catalog.books.length);
    assert.equal(result.copies, accessions.length);

    const book = catalog.books[0];
    assert.ok(book);
    const { rows } = await api.db.query(
      `select b.title, b.authors, b.edition, b.publication_year, b.lc_call_number,
              array_agg(c.accession_number order by c.accession_number) as accessions,
              array_agg(c.barcode order by c.accession_number) as barcodes,
              array_agg(distinct c.status::text) as statuses
         from public.books b join public.copies c on c.book_id = b.id
        where b.isbn = $1 group by b.id`,
      [book.isbn],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, book.title);
    assert.deepEqual(rows[0].authors, book.authors);
    assert.equal(rows[0].edition, book.edition);
    assert.equal(rows[0].publication_year, book.publicationYear);
    assert.equal(rows[0].lc_call_number, book.lcCallNumber);
    assert.deepEqual(rows[0].accessions, book.copies.map((copy) => copy.accessionNumber));
    assert.deepEqual(rows[0].barcodes, book.copies.map((copy) => copy.barcode));
    assert.deepEqual(rows[0].statuses, ["available"]);
  });

  it("is safe to run again: nothing is duplicated", async () => {
    await seedCatalog(api.db, catalog);
    const counts = await api.db.query(
      "select (select count(*) from public.books where isbn = any($1)) as books, (select count(*) from public.copies where accession_number = any($2)) as copies",
      [isbns, accessions],
    );
    assert.equal(Number(counts.rows[0].books), catalog.books.length);
    assert.equal(Number(counts.rows[0].copies), accessions.length);
  });

  it("bumps the catalog revision, which is how the search index learns the catalog changed", async () => {
    const before = await api.db.query("select revision from public.catalog_revision");
    await api.db.query("insert into public.books (title, authors) values ('Revision probe', '{}') ");
    const after = await api.db.query("select revision from public.catalog_revision");
    await api.db.query("delete from public.books where title = 'Revision probe'");
    assert.ok(BigInt(after.rows[0].revision) > BigInt(before.rows[0].revision));
  });
});
