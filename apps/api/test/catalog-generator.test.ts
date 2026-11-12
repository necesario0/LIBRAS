import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogIndex, tokenize } from "@libras/shared";
import { SEARCH_TOKEN_TARGET, generateCatalog } from "../src/seed/catalog-generator.ts";

/** ISBN-13 check: weights 1 and 3 alternate, the sum must be a multiple of 10. */
function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = [...isbn].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
}

describe("sample catalog generator", () => {
  // Generated once: it is the real seed size, about 50,000 search tokens.
  const catalog = generateCatalog();

  it("is reproducible: the same seed gives the same catalog, another seed a different one", () => {
    assert.deepEqual(generateCatalog(), catalog);
    assert.notDeepEqual(generateCatalog({ seed: 2 }).books.slice(0, 5), catalog.books.slice(0, 5));
  });

  it("is sized to the benchmark scale: about 50,000 distinct title and author words", () => {
    const words = new Set(catalog.books.flatMap((book) => [...tokenize(book.title), ...book.authors.flatMap(tokenize)]));
    assert.ok(words.size >= SEARCH_TOKEN_TARGET, `only ${words.size} words`);
    assert.ok(words.size <= SEARCH_TOKEN_TARGET * 1.01, `${words.size} words is well over the target`);
    assert.equal(buildCatalogIndex(catalog.books.map((book) => ({ id: book.isbn, title: book.title, authors: book.authors }))).tokenCount, words.size);
  });

  it("gives every Book a title, an author, a valid ISBN-13, an LC call number and at least one Copy", () => {
    assert.ok(catalog.books.length > 5000);
    for (const book of catalog.books) {
      assert.ok(book.title.trim().length > 0);
      assert.ok(book.authors.length >= 1);
      assert.ok(isValidIsbn13(book.isbn), `bad ISBN ${book.isbn}`);
      assert.match(book.lcCallNumber, /^[A-Z]{1,3}\d{1,4}(\.\d+)? \.[A-Z]\d+ [A-Z]\d+ \d{4}$/);
      assert.ok(book.copies.length >= 1);
    }
  });

  it("gives every Copy a unique accession number and a unique numeric barcode", () => {
    const copies = catalog.books.flatMap((book) => book.copies);
    assert.ok(copies.length > catalog.books.length);
    assert.equal(new Set(copies.map((copy) => copy.accessionNumber)).size, copies.length);
    assert.equal(new Set(copies.map((copy) => copy.barcode)).size, copies.length);
    for (const copy of copies) {
      assert.match(copy.accessionNumber, /^AC-\d{7}$/);
      assert.match(copy.barcode, /^\d{10}$/);
    }
    assert.equal(new Set(catalog.books.map((book) => book.isbn)).size, catalog.books.length);
  });
});
