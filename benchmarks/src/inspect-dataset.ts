// Writes a description of the benchmark datasets to results/dataset.json, so they can be inspected BEFORE any
// timing is collected: token length distribution, alphabet, sample tokens, and the edit mix of the typo queries.
//   npm run dataset
import { generateCatalog } from "../../apps/api/src/seed/catalog-generator.ts";
import { tokenize } from "../../packages/shared/src/search/catalog-index.ts";
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import { levenshtein } from "./search/levenshtein.ts";
import { environmentInfo, writeResult } from "./harness.ts";

const N = 50_000;
const histogram = (xs: number[]) => {
  const h: Record<number, number> = {};
  for (const x of xs) h[x] = (h[x] ?? 0) + 1;
  return h;
};

const words = generateLexicon("words", N, 42);
const callnos = generateLexicon("callnos", 20_000, 42);
const queries = generateQueries(words, { count: 1500, seed: 9, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
const catalog = generateCatalog();
const titleWords = catalog.books.map((b) => tokenize(b.title).length);
const catalogTokens = new Set(catalog.books.flatMap((b) => [...tokenize(b.title), ...b.authors.flatMap(tokenize)]));

writeResult("dataset.json", {
  env: environmentInfo(),
  words: {
    n: words.length,
    meanLength: words.reduce((s, w) => s + w.length, 0) / words.length,
    lengthHistogram: histogram(words.map((w) => w.length)),
    alphabet: [...new Set(words.join(""))].sort().join(""),
    sample: words.filter((_, i) => i % 5000 === 17).slice(0, 10),
  },
  callnos: {
    n: callnos.length,
    meanLength: callnos.reduce((s, w) => s + w.length, 0) / callnos.length,
    sample: callnos.slice(0, 10),
  },
  queries: {
    n: queries.length,
    lengthHistogram: histogram(queries.map((q) => q.text.length)),
    editOpsHistogram: histogram(queries.map((q) => q.edits)),
    distanceHistogram: histogram(queries.map((q) => (q.source ? levenshtein(q.text, q.source) : -1))),
    opTypes: queries.flatMap((q) => q.ops).reduce<Record<string, number>>((h, op) => ({ ...h, [op]: (h[op] ?? 0) + 1 }), {}),
    sample: queries.slice(0, 12).map((q) => ({ query: q.text, intended: q.source, ops: q.ops, distance: q.source ? levenshtein(q.text, q.source) : null })),
  },
  sampleCatalog: {
    books: catalog.books.length,
    copies: catalog.books.reduce((s, b) => s + b.copies.length, 0),
    distinctTokens: catalogTokens.size,
    titleWordsHistogram: histogram(titleWords),
    sampleTitles: catalog.books.filter((_, i) => i % 4000 === 3).slice(0, 8).map((b) => `${b.title} / ${b.authors.join("; ")}`),
  },
});
console.log("Wrote results/dataset.json");
