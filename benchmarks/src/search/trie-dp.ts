import type { Match, SearchIndex } from "./types.ts";

// The team's chosen design (PBL Milestone 1, Algorithm 1): a trie traversed with one
// DP row per node and branch-and-bound pruning when min(row) > k.
// This class follows the specification's pseudocode as literally as possible
// (Map-based children, a fresh row per node). An optimised variant lives in
// trie-dp-flat.ts so we can separate "the algorithm" from "this implementation".

class TrieNode {
  children = new Map<string, TrieNode>();
  word: string | null = null;
}

export interface TrieStats {
  nodesVisited: number;
  nodesPruned: number;
}

export class TrieDpIndex implements SearchIndex {
  readonly name = "trie-dp";
  readonly description = "Trie + DP row per node + branch-and-bound (team's choice, spec-faithful)";
  root = new TrieNode();
  nodeCount = 1;
  lastStats: TrieStats = { nodesVisited: 0, nodesPruned: 0 };

  build(words: readonly string[]): void {
    this.root = new TrieNode();
    this.nodeCount = 1;
    for (const w of words) {
      let node = this.root;
      for (const ch of w) {
        let next = node.children.get(ch);
        if (!next) {
          next = new TrieNode();
          node.children.set(ch, next);
          this.nodeCount++;
        }
        node = next;
      }
      node.word = w;
    }
  }

  search(query: string, k: number): Match[] {
    const m = query.length;
    const results: Match[] = [];
    const stats: TrieStats = { nodesVisited: 0, nodesPruned: 0 };
    const firstRow = new Array<number>(m + 1);
    for (let i = 0; i <= m; i++) firstRow[i] = i;
    if (this.root.word !== null && firstRow[m]! <= k) results.push({ word: this.root.word, dist: firstRow[m]! });

    const traverse = (node: TrieNode, letter: string, prev: number[]): void => {
      stats.nodesVisited++;
      const cur = new Array<number>(m + 1);
      cur[0] = prev[0]! + 1;
      let rowMin = cur[0];
      for (let col = 1; col <= m; col++) {
        const insertCost = cur[col - 1]! + 1;
        const deleteCost = prev[col]! + 1;
        const replaceCost = prev[col - 1]! + (query[col - 1] === letter ? 0 : 1);
        const v = Math.min(insertCost, deleteCost, replaceCost);
        cur[col] = v;
        if (v < rowMin) rowMin = v;
      }
      if (cur[m]! <= k && node.word !== null) results.push({ word: node.word, dist: cur[m]! });
      if (rowMin <= k) {
        for (const [ch, child] of node.children) traverse(child, ch, cur);
      } else {
        stats.nodesPruned += 1; // this node's whole subtree is skipped
      }
    };

    for (const [ch, child] of this.root.children) traverse(child, ch, firstRow);
    this.lastStats = stats;
    return results;
  }
}
