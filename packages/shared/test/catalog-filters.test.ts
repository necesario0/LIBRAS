import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CATALOG_SEARCH_FILTERS, activeFilterCount, catalogSearchQuerySchema, catalogSearchQueryString } from "../src/catalog.ts";
import type { CatalogSearchFilters } from "../src/catalog.ts";

/** What the API reads from the query string the app sends. */
function readBack(queryString: string) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(queryString)) {
    const seen = query[key];
    query[key] = seen === undefined ? value : [...(Array.isArray(seen) ? seen : [seen]), value];
  }
  return catalogSearchQuerySchema.parse(query);
}

const filters = (change: Partial<CatalogSearchFilters>): CatalogSearchFilters => ({ ...DEFAULT_CATALOG_SEARCH_FILTERS, ...change });
// 2026-11-19, 10:00 in Manila.
const now = new Date("2026-11-19T02:00:00Z");

describe("the Subject and Published filters in the search query string", () => {
  it("leaves them out at their defaults", () => {
    assert.equal(catalogSearchQueryString("calculus", DEFAULT_CATALOG_SEARCH_FILTERS, undefined, now), "q=calculus");
    const read = readBack("q=calculus");
    assert.deepEqual([read.subject, read.publishedFrom, read.publishedTo], [[], undefined, undefined]);
  });

  it("sends each Subject, and the API reads them all back", () => {
    const sent = catalogSearchQueryString("data", filters({ subjects: ["Computer Science", "Arts, Design and Architecture"] }), undefined, now);
    assert.deepEqual(readBack(sent).subject, ["Computer Science", "Arts, Design and Architecture"]);
  });

  it("counts the last 5 and 10 years back from the library's year, with no end", () => {
    const last5 = readBack(catalogSearchQueryString("data", filters({ published: { kind: "last", years: 5 } }), undefined, now));
    assert.deepEqual([last5.publishedFrom, last5.publishedTo], [2021, undefined]);
    const last10 = readBack(catalogSearchQueryString("data", filters({ published: { kind: "last", years: 10 } }), undefined, now));
    assert.deepEqual([last10.publishedFrom, last10.publishedTo], [2016, undefined]);
  });

  it("uses the library's calendar: in Manila the new year starts 8 hours before UTC's", () => {
    const newYearInManila = new Date("2026-12-31T17:00:00Z");
    const read = readBack(catalogSearchQueryString("data", filters({ published: { kind: "last", years: 5 } }), undefined, newYearInManila));
    assert.equal(read.publishedFrom, 2022);
  });

  it("sends a custom range with both ends", () => {
    const read = readBack(catalogSearchQueryString("data", filters({ published: { kind: "between", from: 1999, to: 2004 } }), undefined, now));
    assert.deepEqual([read.publishedFrom, read.publishedTo], [1999, 2004]);
  });

  it("drops a repeated Subject", () => {
    assert.deepEqual(readBack("q=a&subject=Law&subject=Law").subject, ["Law"]);
  });
});

describe("activeFilterCount: the number on the Filters chip", () => {
  it("is 0 at the defaults, and does not count Sort or Available now", () => {
    assert.equal(activeFilterCount(DEFAULT_CATALOG_SEARCH_FILTERS), 0);
    assert.equal(activeFilterCount(filters({ sort: "title", availableNow: true })), 0);
  });

  it("counts each Subject, a Published choice, and all editions", () => {
    assert.equal(activeFilterCount(filters({ subjects: ["Law", "Nursing"] })), 2);
    assert.equal(activeFilterCount(filters({ published: { kind: "last", years: 10 } })), 1);
    assert.equal(activeFilterCount(filters({ latestEditionOnly: false })), 1);
    assert.equal(
      activeFilterCount(filters({ subjects: ["Law"], published: { kind: "between", from: 2000, to: 2010 }, latestEditionOnly: false })),
      3,
    );
  });
});
