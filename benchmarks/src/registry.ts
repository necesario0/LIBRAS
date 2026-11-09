import { BkTreeIndex } from "./search/bk-tree.ts";
import { LinearScanIndex } from "./search/linear-scan.ts";
import { NgramIndex } from "./search/ngram.ts";
import { SymSpellIndex } from "./search/symspell.ts";
import { TrieDpIndex } from "./search/trie-dp.ts";
import { TrieDpFlatIndex } from "./search/trie-dp-flat.ts";
import type { SearchIndex } from "./search/types.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { DaryHeapDispatcher } from "./heap/dary-heap.ts";
import { LazyHeapDispatcher, PairingHeapDispatcher } from "./heap/lazy-and-pairing.ts";
import { LinearScanDispatcher, SortedArrayDispatcher } from "./heap/simple-queues.ts";
import type { Dispatcher } from "./heap/types.ts";

/** Factories so every run gets a fresh, independent instance. */
export const searchFactories: Array<() => SearchIndex> = [
  () => new TrieDpIndex(), // team's choice (spec-faithful)
  () => new TrieDpFlatIndex(), // team's algorithm, optimised implementation
  () => new LinearScanIndex(),
  () => new BkTreeIndex(),
  () => new SymSpellIndex(2),
  () => new NgramIndex(),
];

export const dispatcherFactories: Array<() => Dispatcher> = [
  () => new BinaryHeapDispatcher(false), // team's choice (spec-faithful)
  () => new BinaryHeapDispatcher(true),
  () => new DaryHeapDispatcher(4),
  () => new LazyHeapDispatcher(),
  () => new PairingHeapDispatcher(),
  () => new SortedArrayDispatcher(),
  () => new LinearScanDispatcher(),
];

/** Names of the team's chosen designs, highlighted in reports. */
export const TEAM_CHOICE = new Set(["trie-dp", "binary-heap"]);
