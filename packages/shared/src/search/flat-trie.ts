// Bounded Levenshtein Trie Search in its flat typed-array form (ADR 0001).
//
// The algorithm is the milestone's: a trie of the lexicon, one dynamic
// programming row of edit distances per trie node, and branch-and-bound that
// abandons a subtree once the smallest value in its row exceeds the bound. The
// trie is flattened into typed arrays (32-bit child offsets) and the rows live
// in one buffer indexed by depth, so it is small and fast; see
// `benchmarks/results/search.md` for the measurements behind the choice.
//
// A FlatTrie is immutable. When the lexicon changes, build a new one and swap
// the reference: a search that already started keeps reading the old arrays.

/** One lexicon word within the distance bound of the query. */
export interface TrieMatch {
  word: string;
  /** Position of the word in the list the trie was built from. */
  wordIndex: number;
  /** Levenshtein distance from the query (substitution, insertion and deletion each cost 1). */
  distance: number;
}

/** Built by `buildTrie`. Treat every field as read-only. */
export interface FlatTrie {
  readonly words: readonly string[];
  readonly nodeCount: number;
  /** Length of the longest word. */
  readonly maxDepth: number;
  /** Node i's children are the edges [childStart[i], childStart[i + 1]). */
  readonly childStart: Int32Array;
  readonly edgeChar: Uint16Array;
  readonly edgeTarget: Int32Array;
  /** Index into `words` of the word that ends at a node, or -1 when no word does. */
  readonly wordIndexAt: Int32Array;
}

interface PointerNode {
  kids: Map<number, PointerNode>;
  wordIndex: number;
}

/**
 * Builds the flat trie for `words`. Compare words as they are: lowercase them
 * and strip accents first (see `normalizeText`) when the search should ignore
 * them. A word listed twice is stored once, at its first position.
 */
export function buildTrie(words: readonly string[]): FlatTrie {
  // A temporary pointer trie, flattened breadth-first below.
  const root: PointerNode = { kids: new Map(), wordIndex: -1 };
  let maxDepth = 0;
  words.forEach((word, wordIndex) => {
    let node = root;
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i);
      let next = node.kids.get(code);
      if (!next) {
        next = { kids: new Map(), wordIndex: -1 };
        node.kids.set(code, next);
      }
      node = next;
    }
    if (node.wordIndex === -1) node.wordIndex = wordIndex;
    if (word.length > maxDepth) maxDepth = word.length;
  });

  const order: PointerNode[] = [root];
  for (let i = 0; i < order.length; i++) for (const child of order[i]!.kids.values()) order.push(child);
  const position = new Map<PointerNode, number>();
  order.forEach((node, i) => position.set(node, i));

  const nodeCount = order.length;
  const childStart = new Int32Array(nodeCount + 1);
  let edges = 0;
  for (let i = 0; i < nodeCount; i++) {
    childStart[i] = edges;
    edges += order[i]!.kids.size;
  }
  childStart[nodeCount] = edges;

  const edgeChar = new Uint16Array(edges);
  const edgeTarget = new Int32Array(edges);
  const wordIndexAt = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const node = order[i]!;
    wordIndexAt[i] = node.wordIndex;
    let edge = childStart[i]!;
    for (const [code, child] of node.kids) {
      edgeChar[edge] = code;
      edgeTarget[edge] = position.get(child)!;
      edge++;
    }
  }
  return { words, nodeCount, maxDepth, childStart, edgeChar, edgeTarget, wordIndexAt };
}

/**
 * Every word in the trie within Levenshtein distance `maxDistance` of `query`,
 * in no particular order. Safe to call from many places at once: all working
 * memory is allocated per call.
 */
export function searchTrie(trie: FlatTrie, query: string, maxDistance: number): TrieMatch[] {
  const m = query.length;
  const stride = m + 1;
  const { words, childStart, edgeChar, edgeTarget, wordIndexAt } = trie;
  const rows = new Int32Array((trie.maxDepth + 2) * stride);
  const q = new Uint16Array(m);
  for (let i = 0; i < m; i++) q[i] = query.charCodeAt(i);
  for (let i = 0; i <= m; i++) rows[i] = i;

  const results: TrieMatch[] = [];
  const rootWord = wordIndexAt[0]!;
  if (rootWord !== -1 && rows[m]! <= maxDistance) {
    results.push({ word: words[rootWord]!, wordIndex: rootWord, distance: rows[m]! });
  }

  // An explicit stack of (node, next edge) per depth avoids recursion.
  const stackNode = new Int32Array(trie.maxDepth + 2);
  const stackEdge = new Int32Array(trie.maxDepth + 2);
  let sp = 0;
  stackNode[0] = 0;
  stackEdge[0] = childStart[0]!;
  while (sp >= 0) {
    const node = stackNode[sp]!;
    const edge = stackEdge[sp]!;
    if (edge >= childStart[node + 1]!) {
      sp--;
      continue;
    }
    stackEdge[sp] = edge + 1;
    const child = edgeTarget[edge]!;
    const letter = edgeChar[edge]!;
    const depth = sp + 1;
    const prevBase = (depth - 1) * stride;
    const curBase = depth * stride;
    rows[curBase] = rows[prevBase]! + 1;
    let rowMin = rows[curBase]!;
    for (let col = 1; col <= m; col++) {
      let v = rows[prevBase + col - 1]! + (q[col - 1] === letter ? 0 : 1);
      const deletion = rows[prevBase + col]! + 1;
      if (deletion < v) v = deletion;
      const insertion = rows[curBase + col - 1]! + 1;
      if (insertion < v) v = insertion;
      rows[curBase + col] = v;
      if (v < rowMin) rowMin = v;
    }
    const wordIndex = wordIndexAt[child]!;
    if (wordIndex !== -1 && rows[curBase + m]! <= maxDistance) {
      results.push({ word: words[wordIndex]!, wordIndex, distance: rows[curBase + m]! });
    }
    // Branch and bound: below this node no word can get closer than the row minimum.
    if (rowMin <= maxDistance && childStart[child]! < childStart[child + 1]!) {
      sp++;
      stackNode[sp] = child;
      stackEdge[sp] = childStart[child]!;
    }
  }
  return results;
}
