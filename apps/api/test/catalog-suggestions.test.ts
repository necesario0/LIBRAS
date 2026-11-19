import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { CatalogSuggestionsResponse } from "@libras/shared";
import { createTestAccount, createTestMember, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";

function uniqueWord(prefix = "zq"): string {
  const letters = randomUUID().replaceAll("-", "").replace(/[0-9]/g, (digit) => "abcdefghij"[Number(digit)] ?? "a");
  return `${prefix}${letters.slice(0, 10)}`;
}
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

describe("GET /catalog/suggestions", () => {
  let api: TestApi;
  let member: TestMember;
  const bookIds: string[] = [];

  async function addBook(title: string, authors: string[], extra: { isbn?: string; accession?: string; barcode?: string } = {}): Promise<string> {
    const { rows } = await api.db.query("insert into public.books (title, authors, isbn) values ($1, $2, $3) returning id", [title, authors, extra.isbn ?? null]);
    const id: string = rows[0].id;
    bookIds.push(id);
    await api.db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [
      id,
      extra.accession ?? `T-${randomUUID()}`,
      extra.barcode ?? `T-${randomUUID()}`,
    ]);
    return id;
  }

  function suggest(query: string, token: string | null = member.accessToken): Promise<Response> {
    return fetch(`${api.baseUrl}/catalog/suggestions?q=${encodeURIComponent(query)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  }

  /** The suggestions once the index has caught up with the Books this test added (it rebuilds in the background). */
  async function suggestions(query: string, atLeast = 1): Promise<CatalogSuggestionsResponse["suggestions"]> {
    return eventually(
      async () => {
        const response = await suggest(query);
        assert.equal(response.status, 200);
        return ((await response.json()) as CatalogSuggestionsResponse).suggestions;
      },
      (found) => found.length >= atLeast,
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

  describe("who may ask", () => {
    it("refuses a request that is not signed in", async () => {
      const response = await suggest("alg", null);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "not_signed_in");
    });

    it("refuses an account that is not a Member", async () => {
      const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lib Rarian" } });
      const token = await signInDirect(librarian.email, librarian.password);
      const response = await suggest("alg", token ?? null);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "not_member");
    });
  });

  describe("the query", () => {
    it("needs at least 2 characters", async () => {
      for (const query of ["", "a", " a ", "  "]) {
        const response = await suggest(query);
        assert.equal(response.status, 400, JSON.stringify(query));
        assert.equal((await response.json()).error.code, "invalid_request");
      }
      assert.equal((await suggest("ab")).status, 200);
    });

    it("answers a query nothing matches with no suggestions, not an error", async () => {
      const response = await suggest(uniqueWord("zn"));
      assert.equal(response.status, 200);
      assert.deepEqual(((await response.json()) as CatalogSuggestionsResponse).suggestions, []);
    });
  });

  describe("what it suggests", () => {
    it("suggests a title with the Book it opens, from the start of a word", async () => {
      const word = uniqueWord();
      const id = await addBook(`Foundations of ${capitalize(word)} Science`, ["Nobody, Else"]);
      const found = await suggestions(word.slice(0, 6));
      assert.deepEqual(found.filter((s) => s.kind === "title"), [{ kind: "title", text: `Foundations of ${capitalize(word)} Science`, bookId: id }]);
    });

    it("suggests an author by name", async () => {
      const surname = uniqueWord("zr");
      await addBook("Collected Essays", [`${capitalize(surname)}, Ana M.`]);
      const found = await suggestions(surname.slice(0, 5));
      assert.ok(found.some((s) => s.kind === "author" && s.text === `${capitalize(surname)}, Ana M.`), JSON.stringify(found));
    });

    it("tolerates a small typo", async () => {
      const word = uniqueWord("zt");
      const id = await addBook(`${capitalize(word)} Handbook`, ["Nobody, Else"]);
      const typo = `${word.slice(0, 5)}${word[6]}${word[5]}${word.slice(7)}`; // two letters swapped
      const found = await suggestions(typo);
      assert.ok(found.some((s) => s.kind === "title" && s.bookId === id), JSON.stringify(found));
    });

    it("returns at most 5", async () => {
      const word = uniqueWord("zm");
      for (let i = 0; i < 8; i++) await addBook(`${capitalize(word)} volume ${i}`, [`${capitalize(word)}, Writer ${i}`]);
      const found = await suggestions(word, 5);
      assert.equal(found.length, 5);
    });
  });

  describe("what it never shows", () => {
    it("never suggests or reveals an accession number, a barcode or an ISBN", async () => {
      const tag = uniqueWord("zp");
      const isbn = `9${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
      const accession = `AC-${uniqueWord("zy")}`;
      const barcode = `BC-${uniqueWord("zx")}`;
      await addBook(`${capitalize(tag)} Guide`, ["Nobody, Else"], { isbn, accession, barcode });

      // Typed as a title word, the Book is suggested, and nothing in the answer carries an identifier.
      const body = JSON.stringify(await suggestions(tag));
      for (const secret of [isbn, accession, barcode]) assert.ok(!body.includes(secret), secret);

      // Typed as an identifier, nothing is suggested at all (search still finds it).
      for (const identifier of [isbn, accession, barcode]) {
        const response = await suggest(identifier);
        assert.equal(response.status, 200);
        assert.deepEqual(((await response.json()) as CatalogSuggestionsResponse).suggestions, [], identifier);
      }
    });

    it("has only a kind, a text and, for a title, a Book id", async () => {
      const word = uniqueWord("zs");
      await addBook(`${capitalize(word)} Atlas`, [`${capitalize(word)}, Sam`]);
      for (const suggestion of await suggestions(word, 2)) {
        assert.deepEqual(Object.keys(suggestion).sort(), suggestion.kind === "title" ? ["bookId", "kind", "text"] : ["kind", "text"]);
      }
    });
  });
});
