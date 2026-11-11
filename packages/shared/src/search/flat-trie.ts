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

/**
 * Builds the flat trie for `words`. Compare words as they are: lowercase them
 * and strip accents first (see `normalizeText`) when the search should ignore
 * them. A word listed twice is stored once, at its first position.
 */
export function buildTrie(words: readonly string[]): FlatTrie {
  // Pass 1: a trie in typed arrays, children kept as linked lists. A node is its
  // index; there are at most one node per letter of input, plus the root.
  let letters = 0;
  let maxDepth = 0;
  for (const word of words) {
    letters += word.length;
    if (word.length > maxDepth) maxDepth = word.length;
  }
  const capacity = letters + 1;
  const firstChild = new Int32Array(capacity).fill(-1);
  const nextSibling = new Int32Array(capacity).fill(-1);
  const letterOf = new Uint16Array(capacity);
  const wordAt = new Int32Array(capacity).fill(-1);
  let nodes = 1;
  words.forEach((word, wordIndex) => {
    let node = 0;
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i);
      let child = firstChild[node]!;
      while (child !== -1 && letterOf[child] !== code) child = nextSibling[child]!;
      if (child === -1) {
        child = nodes++;
        letterOf[child] = code;
        nextSibling[child] = firstChild[node]!;
        firstChild[node] = child;
      }
      node = child;
    }
    if (wordAt[node] === -1) wordAt[node] = wordIndex;
  });

  // Pass 2: flatten breadth-first, so each node's children are contiguous edges.
  const nodeCount = nodes;
  const queue = new Int32Array(nodeCount); // queue[position] = node
  const childStart = new Int32Array(nodeCount + 1);
  const edgeChar = new Uint16Array(nodeCount - 1);
  const edgeTarget = new Int32Array(nodeCount - 1);
  const wordIndexAt = new Int32Array(nodeCount);
  let tail = 1;
  let edge = 0;
  for (let position = 0; position < nodeCount; position++) {
    const node = queue[position]!;
    wordIndexAt[position] = wordAt[node]!;
    childStart[position] = edge;
    for (let child = firstChild[node]!; child !== -1; child = nextSibling[child]!) {
      queue[tail] = child;
      edgeChar[edge] = letterOf[child]!;
      edgeTarget[edge] = tail;
      tail++;
      edge++;
    }
  }
  childStart[nodeCount] = edge;
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
