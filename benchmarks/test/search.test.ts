import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateLexicon, generateQueries } from "../src/data/catalog.ts";
import { boundedLevenshtein, levenshtein } from "../src/search/levenshtein.ts";
import { LinearScanIndex } from "../src/search/linear-scan.ts";
import { sortMatches } from "../src/search/types.ts";
import type { Match } from "../src/search/types.ts";
import { searchFactories } from "../src/registry.ts";

describe("levenshtein reference", () => {
  it("matches known distances", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("flaw", "lawn"), 2);
    assert.equal(levenshtein("same", "same"), 0);
  });
  it("bounded agrees with full distance inside the bound and caps outside it", () => {
    const pairs: Array<[string, string]> = [
      ["kitten", "sitting"], ["introduction", "intorduction"], ["abc", "xyz"], ["library", "libary"], ["a", "abcdef"],
    ];
    for (const [a, b] of pairs) {
      for (const k of [0, 1, 2, 3]) {
        const full = levenshtein(a, b);
        const bounded = boundedLevenshtein(a, b, k);
        assert.equal(bounded, full <= k ? full : k + 1, `${a} vs ${b} k=${k}`);
      }
    }
  });
});

describe("synthetic catalog", () => {
  it("is deterministic and unique", () => {
    const a = generateLexicon("words", 2000, 5);
    const b = generateLexicon("words", 2000, 5);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, 2000);
  });
});

// Ground truth: brute-force full Levenshtein over the whole lexicon.
function truth(words: readonly string[], q: string, k: number): Match[] {
  const out: Match[] = [];
  for (const w of words) {
    const d = levenshtein(q, w);
    if (d <= k) out.push({ word: w, dist: d });
  }
  return sortMatches(out);
}

for (const kind of ["words", "callnos"] as const) {
  describe(`every search index returns exactly the brute-force result (${kind})`, () => {
    const lexicon = generateLexicon(kind, 3000, 11);
    const queries = generateQueries(lexicon, { count: 400, seed: 3, noMatchFraction: 0.1, minLen: 3 });
    for (const make of searchFactories) {
      const idx = make();
      it(idx.name, () => {
        idx.build(lexicon);
        for (const k of [0, 1, 2]) {
          for (const qc of queries) {
            const got = sortMatches(idx.search(qc.text, k));
            const want = truth(lexicon, qc.text, k);
            assert.deepEqual(got, want, `${idx.name} q="${qc.text}" k=${k}`);
          }
        }
      });
    }
  });
}

describe("edge cases", () => {
  it("handles very short queries and k larger than the query", () => {
    const lexicon = generateLexicon("words", 1500, 2);
    for (const make of searchFactories) {
      const idx = make();
      idx.build(lexicon);
      for (const q of ["a", "ab", "xyz"]) {
        for (const k of [1, 2]) {
          assert.deepEqual(sortMatches(idx.search(q, k)), truth(lexicon, q, k), `${idx.name} q="${q}" k=${k}`);
        }
      }
    }
  });
  it("linear scan returns nothing on an empty lexicon", () => {
    const idx = new LinearScanIndex();
    idx.build([]);
    assert.deepEqual(idx.search("abc", 2), []);
  });
});
