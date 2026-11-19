import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogIndex } from "../src/search/catalog-index.ts";
import type { IndexedBook } from "../src/search/catalog-index.ts";
import { pickSuggestions } from "../src/search/suggestions.ts";

const books: IndexedBook[] = [
  { id: "b1", title: "Introduction to Algorithms", authors: ["Cormen, Thomas H.", "Leiserson, Charles E."], isbn: "9780262046305", accessionNumbers: ["AC-0000001"] },
  { id: "b2", title: "Principles of Database Management", authors: ["Santos, María José"] },
  { id: "b4", title: "Algorithms Unlocked", authors: ["Cormen, Thomas H."] },
  { id: "b5", title: "Algorithmic Thinking", authors: ["Reyes, Ana"] },
];
const index = buildCatalogIndex(books);
const ids = (query: string) => index.suggest(query).hits.map((hit) => hit.bookId).sort();

describe("CatalogIndex.suggest", () => {
  it("matches the word being typed as the start of a longer word", () => {
    assert.deepEqual(ids("algo"), ["b1", "b4", "b5"]);
    assert.deepEqual(ids("cor"), ["b1", "b4"]);
  });

  it("keeps the earlier words whole and tolerant of a typo", () => {
    assert.deepEqual(ids("thomass cor"), ["b1", "b4"]);
    assert.deepEqual(ids("unlocked alg"), ["b4"]);
  });

  it("tolerates a typo in the word being typed", () => {
    assert.deepEqual(ids("algoritm"), ["b1", "b4"]);
  });

  it("treats a word followed by a space as finished", () => {
    assert.deepEqual(ids("algo "), []);
  });

  it("never matches an ISBN or an accession number", () => {
    assert.deepEqual(ids("9780262046305"), []);
    assert.deepEqual(ids("AC-0000001"), []);
  });

  it("ranks closer matches first", () => {
    assert.equal(index.suggest("algorithms").hits[0]?.distance, 0);
  });
});

describe("pickSuggestions", () => {
  const found = [
    { id: "b1", title: "Introduction to Algorithms", authors: ["Cormen, Thomas H.", "Leiserson, Charles E."] },
    { id: "b4", title: "Algorithms Unlocked", authors: ["Cormen, Thomas H."] },
    { id: "b5", title: "Algorithmic Thinking", authors: ["Reyes, Ana"] },
  ];

  it("gives titles with their Book, then authors that match what was typed", () => {
    assert.deepEqual(pickSuggestions("cormen", found.slice(0, 2), 5), [
      { kind: "title", text: "Introduction to Algorithms", bookId: "b1" },
      { kind: "title", text: "Algorithms Unlocked", bookId: "b4" },
      { kind: "author", text: "Cormen, Thomas H." },
    ]);
  });

  it("matches an author's words as typed, even with a typo", () => {
    const authors = pickSuggestions("thomass cor", found, 5).filter((s) => s.kind === "author");
    assert.deepEqual(authors, [{ kind: "author", text: "Cormen, Thomas H." }]);
  });

  it("lists an author once however many Books they wrote", () => {
    const authors = pickSuggestions("cormen", found, 5).filter((s) => s.kind === "author");
    assert.equal(authors.length, 1);
  });

  it("lists a title once, whatever the case and punctuation", () => {
    const twice = [
      { id: "a", title: "Data Structures", authors: [] },
      { id: "b", title: "data  structures.", authors: [] },
    ];
    assert.deepEqual(pickSuggestions("data", twice, 5), [{ kind: "title", text: "Data Structures", bookId: "a" }]);
  });

  it("never returns more than the limit, and fills spare room with more titles", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, title: `Algorithm volume ${i}`, authors: [] }));
    const picked = pickSuggestions("algorithm", many, 5);
    assert.equal(picked.length, 5);
    assert.ok(picked.every((s) => s.kind === "title"));
  });

  it("keeps room for authors when many titles match", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, title: `Cormen volume ${i}`, authors: ["Cormen, Thomas H."] }));
    const picked = pickSuggestions("cormen", many, 5);
    assert.deepEqual(picked.map((s) => s.kind), ["title", "title", "title", "title", "author"]);
  });
});
