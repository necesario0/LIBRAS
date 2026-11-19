import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { BookSearchResult, CatalogSearchResponse, CopyStatus } from "@libras/shared";
import { createTestAccount, createTestMember, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";

/** A word no real or generated title contains: random letters, so tests never meet other data in the shared database. */
function uniqueWord(prefix = "zq"): string {
  const letters = randomUUID().replaceAll("-", "").replace(/[0-9]/g, (digit) => "abcdefghij"[Number(digit)] ?? "a");
  return `${prefix}${letters.slice(0, 10)}`;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

describe("GET /catalog/search", () => {
  let api: TestApi;
  let member: TestMember;
  const bookIds: string[] = [];

  /** Adds a Book with Copies of the given statuses straight to the database, the way the seed would. */
  async function addBook(
    title: string,
    authors: string[],
    copyStatuses: CopyStatus[],
    {
      edition = null,
      publicationYear = null,
      lcCallNumber = null,
    }: { edition?: string | null; publicationYear?: number | null; lcCallNumber?: string | null } = {},
  ): Promise<string> {
    const { rows } = await api.db.query(
      "insert into public.books (title, authors, edition, publication_year, lc_call_number) values ($1, $2, $3, $4, $5) returning id",
      [title, authors, edition, publicationYear, lcCallNumber],
    );
    const id: string = rows[0].id;
    bookIds.push(id);
    for (const status of copyStatuses) {
      await api.db.query("insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4)", [
        id,
        `T-${randomUUID()}`,
        `T-${randomUUID()}`,
        status,
      ]);
    }
    return id;
  }

  async function search(query: string, token: string | null = member.accessToken, extra = ""): Promise<Response> {
    return fetch(`${api.baseUrl}/catalog/search?q=${encodeURIComponent(query)}${extra}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  /**
   * The Books a search returns. A Book added to the catalog reaches search once the index has been
   * rebuilt in the background, so this waits for at least `atLeast` results (every caller adds the Books it expects first).
   */
  async function results(query: string, atLeast = 1): Promise<BookSearchResult[]> {
    return (await resultsWithTotal(query, atLeast)).results;
  }

  async function resultsWithTotal(query: string, atLeast = 1, extra = ""): Promise<CatalogSearchResponse> {
    return eventually(
      async () => {
        const response = await search(query, member.accessToken, extra);
        assert.equal(response.status, 200);
        return (await response.json()) as CatalogSearchResponse;
      },
      (body) => body.total >= atLeast,
    );
  }

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
  });
  after(async () => {
    await api.db.query("delete from public.loans where copy_id in (select id from public.copies where book_id = any($1))", [bookIds]);
    await api.db.query("delete from public.copies where book_id = any($1)", [bookIds]);
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  describe("who may search", () => {
    it("refuses a request that is not signed in", async () => {
      const response = await search("anything", null);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "not_signed_in");
    });

    it("refuses an account that is not a Member", async () => {
      const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lib Rarian" } });
      const token = await signInDirect(librarian.email, librarian.password);
      const response = await search("anything", token ?? null);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "not_member");
    });
  });

  describe("exact matches", () => {
    it("finds a Book by a word of its title", async () => {
      const word = uniqueWord();
      const id = await addBook(`Principles of ${capitalize(word)} Studies`, ["Nobody, Else"], ["available"]);
      const found = await results(word);
      assert.deepEqual(found.map((book) => book.id), [id]);
      assert.equal(found[0]?.title, `Principles of ${capitalize(word)} Studies`);
      assert.deepEqual(found[0]?.authors, ["Nobody, Else"]);
    });

    it("finds a Book by an author's name, in any case", async () => {
      const surname = uniqueWord("zr");
      const id = await addBook("Collected Essays", [`${capitalize(surname)}, Ana M.`], ["available"]);
      assert.deepEqual((await results(surname.toUpperCase())).map((book) => book.id), [id]);
    });

    it("finds a Book by its ISBN, an accession number or its call number", async () => {
      const isbn = `9${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
      const callNumber = `QA${uniqueWord("x").toUpperCase()}`;
      const { rows } = await api.db.query(
        "insert into public.books (title, authors, isbn, lc_call_number) values ($1, '{}', $2, $3) returning id",
        [`Identifiers ${uniqueWord()}`, isbn, callNumber],
      );
      bookIds.push(rows[0].id);
      const accession = `ACC-${uniqueWord("y")}`;
      await api.db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [rows[0].id, accession, `B-${randomUUID()}`]);

      for (const query of [isbn, accession, callNumber.toLowerCase()]) {
        assert.deepEqual((await results(query)).map((book) => book.id), [rows[0].id], query);
      }
    });
  });

  describe("exact identifiers: ISBN, accession number, LC call number", () => {
    // One Book with all three identifiers and two Copies, and a look-alike Book whose title is
    // one character away from each identifier. Fuzzy matching would return the look-alike.
    const tag = uniqueWord("zk").toUpperCase();
    const isbn = `9${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
    const nearIsbn = `${isbn.slice(0, 12)}${(Number(isbn[12]) + 1) % 10}`;
    const callNumber = `QA${tag} .D2 C79 2001`;
    const nearCallNumber = `QA${tag} .D2 C78 2001`;
    const accessions = [`AC-${tag}-1`, `AC-${tag}-2`];
    const nearAccession = `AC-${tag}-3`;
    let bookId = "";
    let lookalikeId = "";

    before(async () => {
      const { rows } = await api.db.query(
        "insert into public.books (title, authors, isbn, lc_call_number) values ($1, '{}', $2, $3) returning id",
        [`Exactly Findable ${uniqueWord()}`, isbn, callNumber],
      );
      bookId = rows[0].id;
      bookIds.push(bookId);
      for (const accession of accessions) {
        await api.db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [bookId, accession, `B-${randomUUID()}`]);
      }
      lookalikeId = await addBook(`${nearIsbn} ${nearCallNumber} ${nearAccession}`, ["Lookalike, Lou"], ["available"]);
      await results(nearIsbn); // wait until the look-alike is in the index
      await results(isbn);
    });

    const only = async (query: string) => (await results(query)).map((book) => book.id);

    it("finds the Book by its ISBN, with or without hyphens, and nothing else", async () => {
      assert.deepEqual(await only(isbn), [bookId]);
      assert.deepEqual(await only(`${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}`), [bookId]);
    });

    it("finds the Book by the accession number of any of its Copies, and nothing else", async () => {
      for (const accession of accessions) {
        const found = await results(accession);
        assert.deepEqual(found.map((book) => book.id), [bookId], accession);
        assert.equal(found[0]?.totalCopies, 2);
      }
      assert.deepEqual(await only((accessions[0] ?? "").toLowerCase()), [bookId]);
    });

    it("finds the Book by its LC call number, in any case or punctuation, and nothing else", async () => {
      assert.deepEqual(await only(callNumber), [bookId]);
      assert.deepEqual(await only(callNumber.toLowerCase().replaceAll(" ", "")), [bookId]);
    });

    it("finds nothing for an identifier that is one character off, even though a Book's title is that close", async () => {
      for (const near of [`${isbn.slice(0, 12)}${(Number(isbn[12]) + 2) % 10}`, `QA${tag} .D2 C77 2001`, `AC-${tag}-4`]) {
        const response = await search(near);
        assert.equal(response.status, 200, near);
        const body = (await response.json()) as CatalogSearchResponse;
        assert.deepEqual([body.total, body.results], [0, []], near);
      }
    });

    it("still finds a Book by the exact words in its title, whatever they look like", async () => {
      assert.deepEqual(await only(nearIsbn), [lookalikeId]);
      assert.deepEqual(await only(nearAccession), [lookalikeId]);
    });
  });

  describe("typos", () => {
    it("still finds the Book when a title word has a typo", async () => {
      const word = uniqueWord("zt");
      const id = await addBook(`A History of ${capitalize(word)}`, ["Nobody, Else"], ["available"]);
      const typo = `${word.slice(0, 6)}${word.slice(7)}`; // one letter missing
      assert.deepEqual((await results(typo)).map((book) => book.id), [id]);
    });

    it("still finds the Book when an author's name has two letters swapped", async () => {
      const surname = uniqueWord("zu");
      const id = await addBook("Letters to a Young Librarian", [`${capitalize(surname)}, Ben`], ["available"]);
      const swapped = `${surname.slice(0, 4)}${surname[5]}${surname[4]}${surname.slice(6)}`;
      assert.deepEqual((await results(swapped)).map((book) => book.id), [id]);
    });
  });

  describe("no results", () => {
    it("answers 200 with an empty list, not an error", async () => {
      const query = `${uniqueWord("zv")} ${uniqueWord("zw")}`;
      const response = await search(query);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { query, total: 0, results: [] });
    });

    it("is not confused with a search that could not run", async () => {
      for (const url of ["/catalog/search", "/catalog/search?q=", "/catalog/search?q=%20%20", `/catalog/search?q=${"a".repeat(101)}`, "/catalog/search?q=x&limit=0", "/catalog/search?q=x&limit=999"]) {
        const response = await fetch(`${api.baseUrl}${url}`, { headers: { authorization: `Bearer ${member.accessToken}` } });
        assert.equal(response.status, 400, url);
        const body = await response.json();
        assert.equal(body.error.code, "invalid_request", url);
        assert.equal(typeof body.error.message, "string");
        assert.equal(body.results, undefined);
      }
    });
  });

  describe("availability", () => {
    it("shows how many Copies are available, read live from the Copies", async () => {
      const word = uniqueWord("zx");
      const id = await addBook(`Counting ${capitalize(word)}`, ["Nobody, Else"], ["available", "available", "on_loan", "set_aside"]);

      let [book] = await results(word);
      assert.equal(book?.id, id);
      assert.equal(book?.availableCopies, 2);
      assert.equal(book?.totalCopies, 4);

      // A Loan changes a Copy's status. The result follows at once: availability is not in the search index.
      await api.db.query("update public.copies set status = 'on_loan' where book_id = $1 and status = 'available'", [id]);
      [book] = await results(word);
      assert.equal(book?.availableCopies, 0);
      assert.equal(book?.totalCopies, 4);
    });

    it("reports zero for a Book with no Copies", async () => {
      const word = uniqueWord("zy");
      await addBook(`Uncatalogued ${capitalize(word)}`, [], []);
      const [book] = await results(word);
      assert.equal(book?.availableCopies, 0);
      assert.equal(book?.totalCopies, 0);
    });
  });

  describe("limits", () => {
    it("returns at most `limit` Books and still says how many matched", async () => {
      const word = uniqueWord("zz");
      for (let i = 0; i < 4; i++) await addBook(`${capitalize(word)} Volume ${i}`, [], ["available"]);
      const body = await resultsWithTotal(word, 4, "&limit=2");
      assert.equal(body.results.length, 2);
      assert.equal(body.total, 4);
    });
  });
  /** The ids of the rows a search returns, waiting until at least `atLeast` rows are there. */
  async function rowIds(query: string, extra = "", atLeast = 1): Promise<string[]> {
    return (await resultsWithTotal(query, atLeast, extra)).results.map((row) => row.id);
  }

  describe("editions of one work (Latest edition only)", () => {
    const word = uniqueWord("ze");
    const title = (edition: string) => `${capitalize(word)} Calculus, ${edition}`;
    let sixth = "";
    let seventh = "";
    let eighth = "";
    let otherAuthor = "";

    before(async () => {
      sixth = await addBook(title("6th ed."), ["Stewart, James"], ["available", "on_loan"], { edition: "6th ed.", publicationYear: 2008 });
      eighth = await addBook(title("8th ed."), ["Stewart, James", "Clegg, Daniel"], ["on_loan"], { edition: "8th ed.", publicationYear: 2016 });
      seventh = await addBook(`${capitalize(word)} calculus (7th edition)`, ["STEWART, James"], ["available"], { edition: "7th ed.", publicationYear: 2012 });
      // Same title, another first author: another work.
      otherAuthor = await addBook(title("2nd ed."), ["Larson, Ron"], ["available"], { edition: "2nd ed.", publicationYear: 2020 });
      await resultsWithTotal(word, 4, "&latestEditionOnly=false");
    });

    it("folds them into one row by default, showing the newest edition and listing the older ones", async () => {
      const body = await resultsWithTotal(word, 2);
      assert.equal(body.total, 2);
      const row = body.results.find((result) => result.id === eighth);
      assert.ok(row, "the newest edition is the row");
      assert.equal(row.publicationYear, 2016);
      assert.deepEqual(
        row.olderEditions.map(({ id, edition, publicationYear, availableCopies, totalCopies }) => ({ id, edition, publicationYear, availableCopies, totalCopies })),
        [
          { id: seventh, edition: "7th ed.", publicationYear: 2012, availableCopies: 1, totalCopies: 1 },
          { id: sixth, edition: "6th ed.", publicationYear: 2008, availableCopies: 1, totalCopies: 2 },
        ],
      );
      const other = body.results.find((result) => result.id === otherAuthor);
      assert.deepEqual(other?.olderEditions, []);
    });

    it("shows every edition as its own row when Latest edition only is off", async () => {
      const body = await resultsWithTotal(word, 4, "&latestEditionOnly=false");
      assert.equal(body.total, 4);
      assert.deepEqual(body.results.map((row) => row.id).sort(), [sixth, seventh, eighth, otherAuthor].sort());
      assert.ok(body.results.every((row) => row.olderEditions.length === 0));
    });

    it("counts rows after folding, also when `limit` cuts the page", async () => {
      const body = await resultsWithTotal(word, 2, "&limit=1");
      assert.equal(body.total, 2);
      assert.equal(body.results.length, 1);
    });

    it("keeps a folded row for Available now only when the edition it shows has an available Copy", async () => {
      // The 8th edition (shown) is out, although the 6th and 7th are on the shelf.
      const body = await resultsWithTotal(word, 1, "&availableNow=true");
      assert.deepEqual([body.total, body.results.map((row) => row.id)], [1, [otherAuthor]]);
      const all = await resultsWithTotal(word, 3, "&availableNow=true&latestEditionOnly=false");
      assert.deepEqual(all.results.map((row) => row.id).sort(), [sixth, seventh, otherAuthor].sort());
      assert.equal(all.total, 3);
    });
  });

  describe("sort", () => {
    const word = uniqueWord("zs");
    // One letter changed: a weaker match than the exact word, so it comes second in Best match.
    const typo = `${word.slice(0, 5)}${word[5] === "a" ? "b" : "a"}${word.slice(6)}`;
    let exact = "";
    let close = "";
    let undated = "";

    before(async () => {
      exact = await addBook(`Zebra ${capitalize(word)}`, ["Uno, Ana"], ["available", "available"], { publicationYear: 2001 });
      close = await addBook(`Apple ${capitalize(typo)}`, ["Dos, Ben"], ["available", "available"], { publicationYear: 2019 });
      undated = await addBook(`Mango ${capitalize(word)} Notes`, ["Tres, Cy"], ["available", "available"]);
      await rowIds(word, "", 3);
    });

    it("puts the best match first by default", async () => {
      const ids = await rowIds(word, "", 3);
      assert.equal(ids[2], close);
      assert.deepEqual(await rowIds(word, "&sort=best", 3), ids);
    });

    it("puts the newest edition first, Books with no year last", async () => {
      assert.deepEqual(await rowIds(word, "&sort=newest", 3), [close, exact, undated]);
    });

    it("orders by title A to Z", async () => {
      assert.deepEqual(await rowIds(word, "&sort=title", 3), [close, undated, exact]);
    });

    it("puts the Books with the most Loans in the last 180 days first", async () => {
      const lita = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Lend" } });
      const now = api.clock.now().getTime();
      const day = 24 * 60 * 60 * 1000;
      /** A returned Loan of one of the Book's Copies, confirmed `daysAgo` days before now. */
      const lend = async (bookId: string, daysAgo: number) => {
        const { rows } = await api.db.query<{ id: string }>("select id from public.copies where book_id = $1 limit 1", [bookId]);
        const out = new Date(now - daysAgo * day);
        await api.db.query(
          "insert into public.loans (copy_id, member_id, confirmed_by, checked_out_at, due_at, returned_at) values ($1, $2, $3, $4, $5, $5)",
          [rows[0]?.id, member.member.id, lita.userId, out, new Date(out.getTime() + day)],
        );
      };
      // exact: 1 Loan in the window. undated: 2. close: 3, but all older than the window.
      await lend(exact, 3);
      await lend(undated, 179);
      await lend(undated, 30);
      await lend(close, 181);
      await lend(close, 200);
      await lend(close, 365);
      assert.deepEqual(await rowIds(word, "&sort=borrowed", 3), [undated, exact, close]);
    });
  });

  describe("Subject and Published filters", () => {
    const word = uniqueWord("zf");
    const Word = capitalize(word);
    let algorithms = "";
    let calculus = "";
    let obligations = "";
    let pamphlet = "";
    let undatedLaw = "";
    let networks3 = "";
    let networks5 = "";

    before(async () => {
      algorithms = await addBook(`${Word} Algorithms`, ["Cormen, Thomas"], ["available"], { publicationYear: 2019, lcCallNumber: "QA76.9.A43 C67 2019" });
      calculus = await addBook(`${Word} Calculus`, ["Leithold, Louis"], ["available"], { publicationYear: 2010, lcCallNumber: "QA303 .L42 2010" });
      obligations = await addBook(`${Word} Obligations`, ["Paras, Edgardo"], ["available"], { publicationYear: 2022, lcCallNumber: "KPM1 .P37 2022" });
      // No call number: no Subject.
      pamphlet = await addBook(`${Word} Pamphlet`, ["Uno, Ana"], ["available"], { publicationYear: 2021 });
      undatedLaw = await addBook(`${Word} Statutes`, ["Dos, Ben"], ["available"], { lcCallNumber: "KPM2 .D6" });
      // Two editions of one work.
      networks3 = await addBook(`${Word} Networks, 3rd ed.`, ["Tanen, Andrew"], ["available"], {
        edition: "3rd ed.",
        publicationYear: 2003,
        lcCallNumber: "TK5105.5 .T36 2003",
      });
      networks5 = await addBook(`${Word} Networks, 5th ed.`, ["Tanen, Andrew"], ["available"], {
        edition: "5th ed.",
        publicationYear: 2011,
        lcCallNumber: "TK5105.5 .T36 2011",
      });
      await resultsWithTotal(word, 7, "&latestEditionOnly=false");
    });

    const sorted = (ids: string[]) => [...ids].sort();
    const withSubject = (subject: string) => `&subject=${encodeURIComponent(subject)}`;

    it("gives each result the Subject of its call number, or none", async () => {
      const body = await resultsWithTotal(word, 7, "&latestEditionOnly=false");
      const subjectOf = new Map(body.results.map((row) => [row.id, row.subject]));
      assert.equal(subjectOf.get(algorithms), "Computer Science");
      assert.equal(subjectOf.get(calculus), "Mathematics");
      assert.equal(subjectOf.get(obligations), "Law");
      assert.equal(subjectOf.get(networks3), "Electrical and Electronics Engineering");
      assert.equal(subjectOf.get(pamphlet), null);
    });

    it("keeps a Book with no Subject while no Subject filter is on", async () => {
      assert.ok((await rowIds(word, "", 6)).includes(pamphlet));
    });

    it("narrows to one Subject, dropping Books with no Subject", async () => {
      const body = await resultsWithTotal(word, 1, withSubject("Computer Science"));
      assert.deepEqual([body.total, body.results.map((row) => row.id)], [1, [algorithms]]);
    });

    it("narrows to any of several Subjects", async () => {
      const ids = await rowIds(word, `${withSubject("Computer Science")}${withSubject("Law")}`, 3);
      assert.deepEqual(sorted(ids), sorted([algorithms, obligations, undatedLaw]));
    });

    it("answers with no rows for a Subject none of the matches has", async () => {
      const response = await search(word, member.accessToken, withSubject("Maritime Studies"));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { query: word, total: 0, results: [] });
    });

    it("narrows to Books published from a year, to a year, or between two, leaving out Books with no year", async () => {
      assert.deepEqual(sorted(await rowIds(word, "&publishedFrom=2019", 3)), sorted([algorithms, pamphlet, obligations]));
      assert.deepEqual(sorted(await rowIds(word, "&publishedTo=2010", 2)), sorted([calculus, networks3]));
      // Both ends are included.
      assert.deepEqual(sorted(await rowIds(word, "&publishedFrom=2010&publishedTo=2019", 3)), sorted([algorithms, calculus, networks5]));
      assert.deepEqual(await rowIds(word, "&publishedFrom=2022&publishedTo=2022", 1), [obligations]);
    });

    it("combines the Subject filter and the years", async () => {
      assert.deepEqual(await rowIds(word, `${withSubject("Law")}&publishedFrom=2020`, 1), [obligations]);
    });

    it("chooses Books before folding editions, so a year filter can make an older edition the row", async () => {
      const folded = (await resultsWithTotal(word, 6)).results.find((row) => row.id === networks5);
      assert.deepEqual(folded?.olderEditions.map((older) => older.id), [networks3]);

      const body = await resultsWithTotal(word, 1, "&publishedTo=2005");
      const row = body.results.find((result) => result.id === networks3);
      assert.ok(row, "the 3rd edition is the row");
      assert.deepEqual(row.olderEditions, []);
      assert.ok(!body.results.some((result) => result.id === networks5));
    });

    it("refuses an unknown Subject, a year that is not a year, and a range that ends before it starts", async () => {
      for (const extra of [
        withSubject("Astrology"),
        withSubject(""),
        "&publishedFrom=abc",
        "&publishedFrom=2020.5",
        "&publishedTo=99999",
        "&publishedFrom=2020&publishedTo=2010",
      ]) {
        const response = await search(word, member.accessToken, extra);
        assert.equal(response.status, 400, extra);
        const body = await response.json();
        assert.deepEqual([body.error.code, body.error.message], ["invalid_request", "Check what you typed and try again."], extra);
      }
    });
  });

  describe("invalid sort and switch values", () => {
    it("refuses them with a 400", async () => {
      for (const extra of ["&sort=oldest", "&sort=", "&availableNow=yes", "&availableNow=1", "&latestEditionOnly=no", "&latestEditionOnly=TRUE"]) {
        const response = await search("anything", member.accessToken, extra);
        assert.equal(response.status, 400, extra);
        const body = await response.json();
        assert.deepEqual([body.error.code, body.error.message], ["invalid_request", "Check what you typed and try again."], extra);
      }
    });
  });
});
