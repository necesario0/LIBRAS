import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogIndex, buildCatalogIndexAsync, normalizeText, tokenize, typoBoundFor } from "../src/search/catalog-index.ts";
import type { IndexedBook } from "../src/search/catalog-index.ts";

const books: IndexedBook[] = [
  {
    id: "b1",
    title: "Introduction to Algorithms",
    authors: ["Cormen, Thomas H.", "Leiserson, Charles E."],
    isbn: "9780262046305",
    callNumber: "QA76.6 .C662 2022",
    accessionNumbers: ["AC-0000001", "AC-0000002"],
  },
  {
    id: "b2",
    title: "Principles of Database Management",
    authors: ["Santos, María José"],
    isbn: "9780132143981",
    callNumber: "QA76.9.D3 S26 2019",
    accessionNumbers: ["AC-0000003"],
  },
  {
    id: "b3",
    title: "The Philippine Constitution: A Reviewer",
    authors: ["Cruz, Isagani"],
    isbn: null,
    callNumber: "KPM1000 .C78 2015",
    accessionNumbers: [],
  },
  {
    id: "b4",
    title: "Algorithms Unlocked",
    authors: ["Cormen, Thomas H."],
    accessionNumbers: ["AC-0000004"],
  },
  { id: "b5", title: "Algorithmic Thinking", authors: ["Reyes, Ana"], accessionNumbers: ["AC-0000005"] },
];

const index = buildCatalogIndex(books);
const ids = (query: string) => index.search(query).hits.map((hit) => hit.bookId);

describe("text normalisation", () => {
  it("lowercases, folds accents and splits on anything that is not a letter or digit", () => {
    assert.deepEqual(tokenize("Santos, María José"), ["santos", "maria", "jose"]);
    assert.deepEqual(tokenize("  C++ & the D.3 -- Reviewer "), ["c", "the", "d", "3", "reviewer"]);
    assert.equal(normalizeText("ÑANDÚ"), "nandu");
  });

  it("allows more typos in longer words and none in very short ones", () => {
    assert.equal(typoBoundFor(1), 0);
    assert.equal(typoBoundFor(3), 0);
    assert.equal(typoBoundFor(4), 1);
    assert.equal(typoBoundFor(6), 1);
    assert.equal(typoBoundFor(7), 2);
    assert.equal(typoBoundFor(20), 2);
  });
});

describe("catalog index search", () => {
  it("finds Books by a title word", () => {
    assert.deepEqual(ids("database"), ["b2"]);
  });

  it("finds Books by an author word, ignoring case and accents", () => {
    assert.deepEqual(ids("MARIA"), ["b2"]);
    assert.deepEqual(ids("cormen").sort(), ["b1", "b4"]);
  });

  it("requires every word of the query to match", () => {
    assert.deepEqual(ids("cormen unlocked"), ["b4"]);
    assert.deepEqual(ids("cormen database"), []);
  });

  it("finds a Book despite a typo in a title or author word", () => {
    assert.deepEqual(ids("algorthms"), ["b1", "b4"]);
    assert.deepEqual(ids("constitutoin"), ["b3"]);
    assert.deepEqual(ids("leiserzon"), ["b1"]);
  });

  it("ranks a closer match above a more distant one, and keeps catalog order between equals", () => {
    assert.deepEqual(
      index.search("algorithms").hits.map((hit) => [hit.bookId, hit.distance]),
      [
        ["b1", 0],
        ["b4", 0],
        ["b5", 2],
      ],
    );
    // The distances of every word add up: b4 matches both words exactly, b1 only "cormen".
    assert.deepEqual(
      index.search("cormen unlockd").hits.map((hit) => [hit.bookId, hit.distance]),
      [["b4", 1]],
    );
  });

  it("does not guess at very short words", () => {
    assert.deepEqual(ids("of"), ["b2"]);
    assert.deepEqual(ids("oz"), []);
  });

  it("matches an ISBN, an accession number or an LC call number exactly", () => {
    assert.deepEqual(ids("9780132143981"), ["b2"]);
    assert.deepEqual(ids("978-0-13-214398-1"), ["b2"]);
    assert.deepEqual(ids("ac-0000002"), ["b1"]);
    assert.deepEqual(ids("QA76.9.D3 S26 2019"), ["b2"]);
    assert.deepEqual(ids("qa76.6 .c662 2022"), ["b1"]);
  });

  it("does not match an identifier that is only close", () => {
    assert.deepEqual(ids("9780132143982"), []);
    assert.deepEqual(ids("AC-0000009"), []);
  });

  it("returns nothing for a query with no letters or digits, or no matching Book", () => {
    assert.deepEqual(ids("   "), []);
    assert.deepEqual(ids("???"), []);
    assert.deepEqual(ids("quantum chromodynamics"), []);
  });

  it("limits the hits but still reports how many Books matched", () => {
    const result = index.search("cormen", { limit: 1 });
    assert.equal(result.hits.length, 1);
    assert.equal(result.total, 2);
  });

  it("counts the distinct title and author words it indexed", () => {
    assert.equal(index.bookCount, 5);
    assert.ok(index.tokenCount >= 15);
  });

  it("works for an empty catalog", () => {
    assert.deepEqual(buildCatalogIndex([]).search("anything"), { total: 0, hits: [] });
  });
});

describe("building the index in steps", () => {
  it("gives the same answers as the one-piece build and lets other work run between steps", async () => {
    // Enough Books for several steps.
    const many: IndexedBook[] = Array.from({ length: 2500 }, (_, i) => ({
      id: `m${i}`,
      title: `Volume ${i} of Collected Studies`,
      authors: [`Author${i}, Given`],
      isbn: `97800000${String(i).padStart(5, "0")}`,
    }));
    let pauses = 0;
    const stepped = await buildCatalogIndexAsync(many, async () => {
      pauses += 1;
    });
    const whole = buildCatalogIndex(many);
    assert.ok(pauses >= 3, `only ${pauses} pauses`);
    assert.equal(stepped.bookCount, whole.bookCount);
    assert.equal(stepped.tokenCount, whole.tokenCount);
    for (const query of ["collected studies", "author1999", "volumme 77", "9780000000042", "nothing like it"]) {
      assert.deepEqual(stepped.search(query), whole.search(query), query);
    }
  });
});

describe("exact identifiers are never fuzzy", () => {
  // Books whose titles look like the identifiers of the Books above, one character away.
  const lookalikes: IndexedBook[] = [
    ...books,
    { id: "n1", title: "AC 0000002 Field Notes", authors: ["Lookalike, One"] },
    { id: "n2", title: "9780132143982 Revisited", authors: ["Lookalike, Two"] },
    { id: "n3", title: "QA76 6 C663 Companion", authors: ["Lookalike, Three"] },
  ];
  const withLookalikes = buildCatalogIndex(lookalikes);
  const idsOf = (query: string) => withLookalikes.search(query).hits.map((hit) => hit.bookId);

  it("returns only the Book that has the identifier, not Books whose words are close to it", () => {
    assert.deepEqual(idsOf("AC-0000001"), ["b1"]);
    assert.deepEqual(idsOf("9780132143981"), ["b2"]);
    assert.deepEqual(idsOf("QA76.6 .C662 2022"), ["b1"]);
  });

  it("finds nothing for an identifier that is only one character off, even when a Book's words are that close", () => {
    assert.deepEqual(idsOf("AC-0000003 x"), []);
    assert.deepEqual(idsOf("9780132143983"), []);
    assert.deepEqual(idsOf("QA76.6 .C661 2022"), []);
  });

  it("matches a word that contains a digit exactly", () => {
    assert.deepEqual(idsOf("c663"), ["n3"]);
    assert.deepEqual(idsOf("c664"), []);
  });
});
