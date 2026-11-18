import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import type { BookDetailResponse, CatalogSearchResponse } from "@libras/shared";
import { seedLibraryCatalog } from "../src/seed/library-catalog.ts";
import type { LibraryCatalogSummary } from "../src/seed/library-catalog.ts";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";
import { PRIVATE_SENTINELS } from "./fixtures/make-library-workbook.ts";

// The made-up workbook (`fixtures/make-library-workbook.ts` writes it). Its accession numbers are
// 90001 and up in both sheets, so they never meet the real catalog in a shared local database.
const WORKBOOK = fileURLToPath(new URL("fixtures/library-workbook.xlsx", import.meta.url));
const ACCESSIONS = ["90001", "90002", "90003", "90004", "90005", "90006", "90008", "90009", "90010", "TX90001", "TX90002"];

interface CopyRow {
  accession_number: string;
  barcode: string;
  received_on: string | null;
  status: string;
  title: string;
}

describe("seeding the library's catalog from its accession list", () => {
  let api: TestApi;
  let member: TestMember;
  let summary: LibraryCatalogSummary;
  const logged: string[] = [];

  const copies = async (): Promise<Map<string, CopyRow>> => {
    const { rows } = await api.db.query<CopyRow>(
      `select c.accession_number, c.barcode, to_char(c.received_on, 'YYYY-MM-DD') as received_on, c.status::text as status, b.title
         from public.copies c join public.books b on b.id = c.book_id
        where c.accession_number = any($1)`,
      [[...ACCESSIONS, "90007", "TX90003"]],
    );
    return new Map(rows.map((row) => [row.accession_number, row]));
  };

  const search = async (q: string): Promise<CatalogSearchResponse> => {
    const response = await fetch(`${api.baseUrl}/catalog/search?q=${encodeURIComponent(q)}`, {
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    assert.equal(response.status, 200);
    return (await response.json()) as CatalogSearchResponse;
  };

  const bookDetail = async (id: string): Promise<BookDetailResponse["book"]> => {
    const response = await fetch(`${api.baseUrl}/catalog/books/${id}`, { headers: { authorization: `Bearer ${member.accessToken}` } });
    assert.equal(response.status, 200);
    return ((await response.json()) as BookDetailResponse).book;
  };

  /** The Book a search for this title finds first. */
  const findBook = async (title: string) => {
    const found = await eventually(
      () => search(title),
      (body) => body.results.some((result) => result.title === title),
    );
    const book = found.results.find((result) => result.title === title);
    assert.ok(book, `search finds "${title}"`);
    return book;
  };

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
    summary = await seedLibraryCatalog(api.db, WORKBOOK, (line) => logged.push(line));
  });
  after(async () => {
    const { rows } = await api.db.query<{ book_id: string }>("select distinct book_id from public.copies where accession_number = any($1)", [ACCESSIONS]);
    await api.db.query("delete from public.copies where accession_number = any($1)", [ACCESSIONS]);
    await api.db.query("delete from public.books where id = any($1)", [rows.map((row) => row.book_id)]);
    await api.close();
  });

  it("makes one Copy per row and groups Copies into Books by ISBN, or by title, edition and call number", async () => {
    assert.equal(summary.copies, 11);
    assert.equal(summary.books, 8);
    const rows = await copies();
    assert.deepEqual([...rows.keys()].sort(), [...ACCESSIONS].sort());

    // One ISBN, written as a number in both sheets: one Book with three Copies.
    const python = await findBook("Learning Made-up Python");
    assert.equal(python.totalCopies, 3);
    assert.equal(python.isbn, "9780306406157");
    // No ISBN: the same title (spacing, case and a final full stop aside) and call number is one Book ...
    const guides = await search("Made-up Field Guide");
    const byCall = new Map(guides.results.filter((r) => r.title === "Made-up Field Guide").map((r) => [r.lcCallNumber, r.totalCopies]));
    // ... and another call number is another Book.
    assert.deepEqual(Object.fromEntries(byCall), { "QH45.2 .M3": 2, "QH45.2 .M4": 1 });
  });

  it("cleans what Excel and typing did to the values", async () => {
    const python = await bookDetail((await findBook("Learning Made-up Python")).id);
    assert.equal(python.title, "Learning Made-up Python");
    assert.equal(python.lcCallNumber, "QA76.73.P98 L37 2020");
    assert.deepEqual(python.authors, ["Lovelace, Ada", "Byron, Augusta"]);
    assert.equal(python.edition, "2nd ed.");
    assert.equal(python.publicationYear, 2020);

    const atlas = await findBook("Made-up Atlas of Nowhere");
    assert.equal(atlas.isbn, "0198526636");
    assert.deepEqual(atlas.authors, ["Reyes, Juan", "Cruz, Maria"]);
    const chemistry = await findBook("Made-up Textbook of Imaginary Chemistry");
    assert.equal(chemistry.isbn, "9781402894626");
    assert.deepEqual(chemistry.authors, ["Dela Cruz, Rosa"]);
    const guides = (await search("Made-up Field Guide")).results.filter((r) => r.title === "Made-up Field Guide");
    assert.equal(guides.find((r) => r.lcCallNumber === "QH45.2 .M3")?.publicationYear, 2018, "a year typed as c2018");
    assert.equal((await findBook("Made-up Uncatalogued Book")).publicationYear, null);

    const rows = await copies();
    assert.equal(rows.get("90001")?.received_on, "2024-06-03");
    assert.equal(rows.get("90002")?.received_on, "2024-06-07", "a day serial");
    assert.equal(rows.get("90003")?.received_on, "2024-06-10", "a typed date");
    assert.equal(rows.get("90004")?.received_on, "2024-06-11", "a typed date with a stray space");
    assert.equal(rows.get("90005")?.received_on, null);
    assert.equal(rows.get("90006")?.received_on, null, "a date typed with a five-digit year");
    assert.equal(summary.unreadable.dateReceived, 1);
  });

  it("tells the two accession series apart and gives every Copy a printable barcode", async () => {
    const rows = await copies();
    assert.equal(rows.get("90001")?.title, "Learning Made-up Python");
    assert.equal(rows.get("TX90001")?.title, "Learning Made-up Python");
    assert.equal(rows.get("TX90002")?.title, "Made-up Textbook of Imaginary Chemistry");
    // The workbook's barcode (a formula or a number), as the 10 digits the labels print.
    assert.equal(rows.get("90001")?.barcode, "0000090001");
    assert.equal(rows.get("90002")?.barcode, "0000090002");
    // No barcode in the workbook (the Textbooks sheet has none): one made from the series and the accession number.
    assert.equal(rows.get("90003")?.barcode, "1000090003");
    assert.equal(rows.get("TX90001")?.barcode, "2000090001");
    for (const row of rows.values()) assert.match(row.barcode, /^[0-9]{10}$/);
    assert.equal(new Set([...rows.values()].map((row) => row.barcode)).size, rows.size);
    for (const row of rows.values()) assert.equal(row.status, "available");
  });

  it("reports the rows it skipped, the marked rows and the call numbers that need a look", () => {
    assert.deepEqual(summary.skipped, [{ reason: "no title and no call number", rows: ["Professional row 8", "Textbooks row 4"] }]);
    assert.deepEqual(summary.marked, [
      { mark: "Wrong data", accessionNumbers: ["90003"] },
      { mark: "for review", accessionNumbers: ["90005"] },
    ]);
    assert.deepEqual(summary.unlistedColours, [{ colour: "FF8E7CC3", accessionNumbers: ["90008"] }]);
    assert.deepEqual(summary.callNumbers, { missing: 1, deweyStyle: 1, likelyMistyped: [{ callNumber: "HHV 4145", copies: 1 }] });
    assert.ok(logged.some((line) => line.includes("8 Books") && line.includes("11 Copies")), logged.join("\n"));
    assert.ok(logged.some((line) => line.includes("HHV 4145")));
  });

  it("keeps the longest summary and contents of a Book's Copies, and search does not use them", async () => {
    const python = await bookDetail((await findBook("Learning Made-up Python")).id);
    assert.equal(python.summary, "A longer made-up summary about zephyrine snakes, kept because it is the longest.");
    assert.equal(python.contents, "Part 1. Made-up basics -- Part 2. More made-up basics.");
    const guide = await bookDetail((await findBook("Made-up Atlas of Nowhere")).id);
    assert.equal(guide.summary, null);
    assert.equal(guide.contents, null);
    assert.equal((await search("zephyrine")).total, 0);
  });

  it("never copies cost, source of funds, cataloguer, notes or remarks anywhere", async () => {
    const values = Object.values(PRIVATE_SENTINELS).map(String);
    const { rows: tables } = await api.db.query<{ name: string }>(
      "select format('%I.%I', table_schema, table_name) as name from information_schema.tables where table_schema in ('public', 'auth', 'storage') and table_type = 'BASE TABLE'",
    );
    for (const { name } of tables) {
      const { rows } = await api.db.query<{ found: number }>(`select count(*)::int as found from ${name} t where t::text like any($1)`, [
        values.map((value) => `%${value}%`),
      ]);
      assert.equal(rows[0]?.found, 0, name);
    }
    for (const value of values) assert.ok(!logged.some((line) => line.includes(value)), `the summary mentions ${value}`);
  });

  it("is safe to run again: the same catalog, and a Copy on loan stays on loan", async () => {
    await api.db.query("update public.copies set status = 'on_loan' where accession_number = '90002'");
    const before = await copies();
    const again = await seedLibraryCatalog(api.db, WORKBOOK, () => {});
    assert.equal(again.books, 8);
    assert.equal(again.copies, 11);
    assert.equal(again.copiesAdded, 0);
    assert.equal(again.booksAdded, 0);
    assert.deepEqual(await copies(), before);
    assert.equal(before.get("90002")?.status, "on_loan");
    assert.equal((await findBook("Learning Made-up Python")).availableCopies, 2);
  });
});
