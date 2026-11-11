import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { BookSearchResult, CatalogSearchResponse } from "@libras/shared";
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
  async function addBook(title: string, authors: string[], copyStatuses: Array<"available" | "on_loan" | "set_aside">): Promise<string> {
    const { rows } = await api.db.query("insert into public.books (title, authors) values ($1, $2) returning id", [title, authors]);
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
});
