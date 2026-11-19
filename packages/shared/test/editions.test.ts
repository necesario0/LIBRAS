import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrangeCatalogResults, workKey } from "../src/search/editions.ts";

describe("workKey: when two Books are editions of the same work", () => {
  const same = (a: [string, string[]], b: [string, string[]]) => workKey(a[0], a[1]) === workKey(b[0], b[1]);

  it("matches titles that differ only in case, punctuation and accents", () => {
    assert.ok(same(["Data Structures: A Pseudocode Approach", ["Gilberg, Richard"]], ["data structures - a pseudocode approach", ["Gilberg, Richard"]]));
    assert.ok(same(["Álgebra Lineal", ["Grossman, Stanley"]], ["Algebra lineal", ["Grossman, Stanley"]]));
  });

  it("ignores edition words in the title", () => {
    const base: [string, string[]] = ["Calculus: Early Transcendentals", ["Stewart, James"]];
    for (const title of [
      "Calculus: Early Transcendentals, 8th ed.",
      "Calculus: Early Transcendentals (2nd edition)",
      "Calculus: Early Transcendentals, Third Edition",
      "Calculus: Early Transcendentals, revised ed.",
      "Calculus: Early Transcendentals 10th edn",
    ]) {
      assert.ok(same(base, [title, ["Stewart, James"]]), title);
    }
  });

  it("keeps words that only look like edition words when they are part of the title", () => {
    assert.ok(!same(["The Second Sex", ["Beauvoir, Simone de"]], ["The Sex", ["Beauvoir, Simone de"]]));
    assert.ok(!same(["Statistics Volume 1", []], ["Statistics Volume 2", []]));
    assert.ok(!same(["Ed Wood and Film", ["Grey, Rudolph"]], ["Wood and Film", ["Grey, Rudolph"]]));
  });

  it("needs the same first author, in any case or punctuation", () => {
    assert.ok(same(["Clean Code", ["Martin, Robert C.", "Coplien, James"]], ["Clean code", ["martin robert c", "Someone, Else"]]));
    assert.ok(!same(["Clean Code", ["Martin, Robert C."]], ["Clean Code", ["Coplien, James"]]));
    assert.ok(!same(["Clean Code", ["Martin, Robert C."]], ["Clean Code", []]));
  });
});

describe("arrangeCatalogResults: folding, Available now and the sort", () => {
  type Book = { id: string; title: string; authors: string[]; publicationYear: number | null; availableCopies: number };
  const book = (id: string, title: string, publicationYear: number | null, availableCopies = 1, authors = ["Stewart, James"]): Book => ({
    id,
    title,
    authors,
    publicationYear,
    availableCopies,
  });
  // Best match first, as the search index ranked them.
  const calc6 = book("calc6", "Calculus, 6th ed.", 2008);
  const calc8 = book("calc8", "Calculus, 8th ed.", 2016, 0);
  const calc7 = book("calc7", "Calculus 7th edition", 2012);
  const algebra = book("algebra", "Algebra and Trigonometry", 2020, 2);
  const anon = book("anon", "Calculus Workbook", null, 3, []);
  const ranked = [calc6, algebra, calc8, anon, calc7];
  const defaults = { sort: "best", availableNow: false, latestEditionOnly: true } as const;
  const shown = (rows: ReadonlyArray<{ book: Book }>) => rows.map((row) => row.book.id);

  it("folds editions of one work into one row that shows the newest, at the place of its best match", () => {
    const rows = arrangeCatalogResults(ranked, defaults);
    assert.deepEqual(shown(rows), ["calc8", "algebra", "anon"]);
    assert.deepEqual(rows[0]?.olderEditions.map((older) => older.id), ["calc7", "calc6"]);
    assert.deepEqual(rows[1]?.olderEditions, []);
  });

  it("shows every edition as its own row when latest edition only is off", () => {
    const rows = arrangeCatalogResults(ranked, { ...defaults, latestEditionOnly: false });
    assert.deepEqual(shown(rows), ["calc6", "algebra", "calc8", "anon", "calc7"]);
    assert.ok(rows.every((row) => row.olderEditions.length === 0));
  });

  it("shows the edition with a year over one without, and the better match between equal years", () => {
    const undated = book("undated", "Calculus", null, 1);
    const twinA = book("twinA", "Calculus, 9th ed.", 2016);
    const rows = arrangeCatalogResults([undated, twinA, calc8], defaults);
    assert.deepEqual(shown(rows), ["twinA"]);
    assert.deepEqual(rows[0]?.olderEditions.map((older) => older.id), ["calc8", "undated"]);
  });

  it("keeps a folded row for Available now only when its shown edition has an available Copy", () => {
    // calc8 (shown) has none on the shelf, although calc6 and calc7 do.
    assert.deepEqual(shown(arrangeCatalogResults(ranked, { ...defaults, availableNow: true })), ["algebra", "anon"]);
    assert.deepEqual(shown(arrangeCatalogResults(ranked, { ...defaults, availableNow: true, latestEditionOnly: false })), ["calc6", "algebra", "anon", "calc7"]);
  });

  it("sorts by newest edition, Books with no year last, ties in best-match order", () => {
    const newer = book("newer", "Physics", 2020, 1, ["Young, Hugh"]);
    assert.deepEqual(shown(arrangeCatalogResults([...ranked, newer], { ...defaults, sort: "newest" })), ["algebra", "newer", "calc8", "anon"]);
  });

  it("sorts by title A to Z, ignoring case and accents", () => {
    const zoology = book("zoology", "zoology basics", 2001, 1, ["Hickman, Cleveland"]);
    const etica = book("etica", "Ética y valores", 2001, 1, ["Reyes, Ana"]);
    assert.deepEqual(shown(arrangeCatalogResults([zoology, etica, ...ranked], { ...defaults, sort: "title" })), ["algebra", "calc8", "anon", "etica", "zoology"]);
  });

  it("sorts by most borrowed in the window, ties in best-match order", () => {
    const loansInWindow = new Map([["anon", 5], ["calc8", 2], ["calc6", 9]]);
    // calc6's Loans do not lift its row: the row is the edition it shows.
    assert.deepEqual(shown(arrangeCatalogResults(ranked, { ...defaults, sort: "borrowed", loansInWindow })), ["anon", "calc8", "algebra"]);
    assert.deepEqual(shown(arrangeCatalogResults(ranked, { ...defaults, sort: "borrowed" })), ["calc8", "algebra", "anon"]);
  });
});
