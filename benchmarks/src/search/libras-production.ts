import { buildTrie, searchTrie } from "../../../packages/shared/src/search/flat-trie.ts";
import type { FlatTrie } from "../../../packages/shared/src/search/flat-trie.ts";
import type { Match, SearchIndex } from "./types.ts";

/**
 * The search code LIBRAS ships (packages/shared/src/search/flat-trie.ts), imported as is.
 * It is the same algorithm as trie-dp-flat; benchmarking it here shows the shipped
 * code, not only the prototype, meets the selection rule.
 */
export class LibrasProductionIndex implements SearchIndex {
  readonly name = "libras-flat-trie";
  readonly description = "Shipped implementation: packages/shared/src/search/flat-trie.ts (flat typed-array trie)";
  #trie: FlatTrie = buildTrie([]);

  build(words: readonly string[]): void {
    this.#trie = buildTrie(words);
  }

  search(query: string, k: number): Match[] {
    return searchTrie(this.#trie, query, k).map((m) => ({ word: m.word, dist: m.distance }));
  }
}
