import { levenshtein } from "./levenshtein.ts";
import type { Match, SearchIndex } from "./types.ts";

// BK-tree (Burkhard-Keller 1973): a metric tree keyed by edit distance. Relies on the
// triangle inequality, which Levenshtein satisfies, to skip subtrees.
class BkNode {
  word: string;
  children = new Map<number, BkNode>();
  constructor(word: string) {
    this.word = word;
  }
}

export class BkTreeIndex implements SearchIndex {
  readonly name = "bk-tree";
  readonly description = "BK-tree (metric tree on edit distance)";
  root: BkNode | null = null;

  build(words: readonly string[]): void {
    this.root = null;
    for (const w of words) {
      if (!this.root) { this.root = new BkNode(w); continue; }
      let node = this.root;
      for (;;) {
        const d = levenshtein(w, node.word);
        if (d === 0) break;
        const next = node.children.get(d);
        if (!next) { node.children.set(d, new BkNode(w)); break; }
        node = next;
      }
    }
  }

  search(query: string, k: number): Match[] {
    const out: Match[] = [];
    if (!this.root) return out;
    const stack: BkNode[] = [this.root];
    while (stack.length) {
      const node = stack.pop()!;
      const d = levenshtein(query, node.word);
      if (d <= k) out.push({ word: node.word, dist: d });
      for (let e = d - k; e <= d + k; e++) {
        const child = node.children.get(e);
        if (child) stack.push(child);
      }
    }
    return out;
  }
}
