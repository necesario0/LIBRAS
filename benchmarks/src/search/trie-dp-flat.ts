import type { Match, SearchIndex } from "./types.ts";

/**
 * Same algorithm as trie-dp.ts (trie + DP row per node + min(row) > k pruning), but
 * implemented for speed: the trie is flattened into typed arrays (32-bit child
 * offsets, as the milestone's memory section proposes) and DP rows live in one
 * preallocated buffer indexed by depth. Results must be identical to trie-dp.
 */
export class TrieDpFlatIndex implements SearchIndex {
  readonly name = "trie-dp-flat";
  readonly description = "Same algorithm as trie-dp, flattened typed-array trie + preallocated rows";

  // Node i's children occupy edges [childStart[i], childStart[i+1]).
  childStart = new Int32Array(0);
  edgeChar = new Uint16Array(0);
  edgeTarget = new Int32Array(0);
  wordOf: (string | null)[] = [];
  maxDepth = 0;
  nodeCount = 0;

  build(words: readonly string[]): void {
    // Build a temporary pointer trie, then flatten it breadth-first.
    interface Tmp { kids: Map<number, Tmp>; word: string | null }
    const root: Tmp = { kids: new Map(), word: null };
    let maxDepth = 0;
    for (const w of words) {
      let n = root;
      for (let i = 0; i < w.length; i++) {
        const c = w.charCodeAt(i);
        let nx = n.kids.get(c);
        if (!nx) { nx = { kids: new Map(), word: null }; n.kids.set(c, nx); }
        n = nx;
      }
      n.word = w;
      if (w.length > maxDepth) maxDepth = w.length;
    }
    const order: Tmp[] = [root];
    for (let i = 0; i < order.length; i++) for (const c of order[i]!.kids.values()) order.push(c);
    const index = new Map<Tmp, number>();
    order.forEach((n, i) => index.set(n, i));
    const nodeCount = order.length;
    const childStart = new Int32Array(nodeCount + 1);
    let edges = 0;
    for (let i = 0; i < nodeCount; i++) { childStart[i] = edges; edges += order[i]!.kids.size; }
    childStart[nodeCount] = edges;
    const edgeChar = new Uint16Array(edges);
    const edgeTarget = new Int32Array(edges);
    const wordOf: (string | null)[] = new Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      wordOf[i] = order[i]!.word;
      let e = childStart[i]!;
      for (const [c, child] of order[i]!.kids) { edgeChar[e] = c; edgeTarget[e] = index.get(child)!; e++; }
    }
    this.childStart = childStart;
    this.edgeChar = edgeChar;
    this.edgeTarget = edgeTarget;
    this.wordOf = wordOf;
    this.maxDepth = maxDepth;
    this.nodeCount = nodeCount;
  }

  search(query: string, k: number): Match[] {
    const m = query.length;
    const stride = m + 1;
    const rows = new Int32Array((this.maxDepth + 2) * stride);
    const q = new Uint16Array(m);
    for (let i = 0; i < m; i++) q[i] = query.charCodeAt(i);
    for (let i = 0; i <= m; i++) rows[i] = i;
    const results: Match[] = [];
    const { childStart, edgeChar, edgeTarget, wordOf } = this;
    if (wordOf[0] !== null && rows[m]! <= k) results.push({ word: wordOf[0]!, dist: rows[m]! });

    // Explicit stack of (node, depth) avoids recursion overhead.
    const stackNode = new Int32Array(this.maxDepth + 2);
    const stackEdge = new Int32Array(this.maxDepth + 2);
    let sp = 0;
    stackNode[0] = 0;
    stackEdge[0] = childStart[0]!;
    while (sp >= 0) {
      const node = stackNode[sp]!;
      const e = stackEdge[sp]!;
      if (e >= childStart[node + 1]!) { sp--; continue; }
      stackEdge[sp] = e + 1;
      const child = edgeTarget[e]!;
      const letter = edgeChar[e]!;
      const depth = sp + 1; // depth of child
      const prevBase = (depth - 1) * stride;
      const curBase = depth * stride;
      rows[curBase] = rows[prevBase]! + 1;
      let rowMin = rows[curBase]!;
      for (let col = 1; col <= m; col++) {
        let v = rows[prevBase + col - 1]! + (q[col - 1] === letter ? 0 : 1);
        const del = rows[prevBase + col]! + 1;
        if (del < v) v = del;
        const ins = rows[curBase + col - 1]! + 1;
        if (ins < v) v = ins;
        rows[curBase + col] = v;
        if (v < rowMin) rowMin = v;
      }
      const w = wordOf[child];
      if (w !== null && rows[curBase + m]! <= k) results.push({ word: w!, dist: rows[curBase + m]! });
      if (rowMin <= k && childStart[child]! < childStart[child + 1]!) {
        sp++;
        stackNode[sp] = child;
        stackEdge[sp] = childStart[child]!;
      }
    }
    return results;
  }
}
