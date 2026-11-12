import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTrie, searchTrie } from "../src/search/flat-trie.ts";
import type { TrieMatch } from "../src/search/flat-trie.ts";
import { generateLexicon, generateQueries, levenshtein } from "./support.ts";

const byDistanceThenWord = (a: TrieMatch, b: TrieMatch) => a.distance - b.distance || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0);

/** Ground truth: brute-force full Levenshtein over the whole lexicon. */
function truth(words: readonly string[], query: string, k: number): TrieMatch[] {
  const out: TrieMatch[] = [];
  words.forEach((word, wordIndex) => {
    const distance = levenshtein(query, word);
    if (distance <= k) out.push({ word, wordIndex, distance });
  });
  return out.sort(byDistanceThenWord);
}

describe("flat trie search", () => {
  for (const kind of ["words", "callnos"] as const) {
    it(`returns exactly the brute-force result for every query and k (${kind})`, () => {
      const lexicon = generateLexicon(kind, 1500, 11);
      const trie = buildTrie(lexicon);
      for (const k of [0, 1, 2]) {
        for (const query of generateQueries(lexicon, 150, 3)) {
          const got = searchTrie(trie, query, k).sort(byDistanceThenWord);
          assert.deepEqual(got, truth(lexicon, query, k), `q="${query}" k=${k}`);
        }
      }
    });
  }

  it("handles very short queries and a bound larger than the query", () => {
    const lexicon = generateLexicon("words", 1500, 2);
    const trie = buildTrie(lexicon);
    for (const query of ["a", "ab", "xyz", ""]) {
      for (const k of [1, 2]) {
        assert.deepEqual(searchTrie(trie, query, k).sort(byDistanceThenWord), truth(lexicon, query, k), `q="${query}" k=${k}`);
      }
    }
  });

  it("reports each match with its position in the list the trie was built from", () => {
    const words = ["tort", "torts", "tax", "taxation"];
    const trie = buildTrie(words);
    assert.deepEqual(searchTrie(trie, "taxation", 0), [{ word: "taxation", wordIndex: 3, distance: 0 }]);
    assert.deepEqual(searchTrie(trie, "tors", 1).sort(byDistanceThenWord), [
      { word: "tort", wordIndex: 0, distance: 1 },
      { word: "torts", wordIndex: 1, distance: 1 },
    ]);
  });

  it("finds nothing in an empty trie", () => {
    assert.deepEqual(searchTrie(buildTrie([]), "abc", 2), []);
  });

  it("ignores a word listed twice instead of reporting it twice", () => {
    const trie = buildTrie(["law", "law"]);
    assert.deepEqual(searchTrie(trie, "law", 0), [{ word: "law", wordIndex: 0, distance: 0 }]);
  });

  it("searches the same trie repeatedly with identical results (no state is carried between searches)", () => {
    const lexicon = generateLexicon("words", 500, 5);
    const trie = buildTrie(lexicon);
    const first = searchTrie(trie, lexicon[7] ?? "", 2);
    searchTrie(trie, "zzzzzzzzzzzzzzzzzzzz", 2);
    assert.deepEqual(searchTrie(trie, lexicon[7] ?? "", 2), first);
  });
});
