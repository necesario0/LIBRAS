import { BkTreeIndex } from "./search/bk-tree.ts";
import { LinearScanIndex } from "./search/linear-scan.ts";
import { NgramIndex } from "./search/ngram.ts";
import { SymSpellIndex } from "./search/symspell.ts";
import { TrieDpIndex } from "./search/trie-dp.ts";
import { TrieDpFlatIndex } from "./search/trie-dp-flat.ts";
import { LibrasProductionIndex } from "./search/libras-production.ts";
import type { SearchIndex } from "./search/types.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { DaryHeapDispatcher } from "./heap/dary-heap.ts";
import { LazyHeapDispatcher, PairingHeapDispatcher } from "./heap/lazy-and-pairing.ts";
import { LinearScanDispatcher, SortedArrayDispatcher } from "./heap/simple-queues.ts";
import type { Dispatcher } from "./heap/types.ts";

/** Factories so every run gets a fresh, independent instance. */
export const searchFactories: Array<() => SearchIndex> = [
  () => new LibrasProductionIndex(), // the shipped code (packages/shared), the chosen design
  () => new TrieDpFlatIndex(), // the benchmark prototype of the chosen design
  () => new TrieDpIndex(), // same algorithm with Map-based pointer nodes (the first milestone sketch)
  () => new LinearScanIndex(),
  () => new BkTreeIndex(),
  () => new SymSpellIndex(2),
  () => new NgramIndex(),
];

export const dispatcherFactories: Array<() => Dispatcher> = [
  () => new BinaryHeapDispatcher(true), // in-memory reference of the chosen design: O(log K) cancel
  () => new BinaryHeapDispatcher(false), // the first milestone sketch: O(K) cancel
  () => new DaryHeapDispatcher(4),
  () => new LazyHeapDispatcher(),
  () => new PairingHeapDispatcher(),
  () => new SortedArrayDispatcher(),
  () => new LinearScanDispatcher(),
];

/**
 * Names of the chosen designs, highlighted in bold in reports: the shipped flat trie and its prototype,
 * and the indexed binary heap that is the in-memory reference of the dispatcher. The shipped dispatcher
 * itself is the PostgreSQL queue measured by bench-pg.ts.
 */
export const TEAM_CHOICE = new Set(["libras-flat-trie", "trie-dp-flat", "binary-heap+index"]);
