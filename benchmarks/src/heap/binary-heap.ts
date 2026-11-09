import { less } from "./types.ts";
import type { Dispatcher, Reservation } from "./types.ts";

/**
 * The team's design (Algorithm 2): array-backed complete binary min-heap with SiftUp /
 * SiftDown. `indexed = false` is the spec-faithful version: removing an arbitrary
 * reservation needs an O(K) search first. `indexed = true` adds an id -> position map
 * so cancel/expire is O(log K).
 */
export class BinaryHeapDispatcher implements Dispatcher {
  readonly name: string;
  readonly description: string;
  readonly supportsFastRemove: boolean;
  heap: Reservation[] = [];
  pos: Map<number, number> | null;

  constructor(indexed: boolean) {
    this.supportsFastRemove = indexed;
    this.pos = indexed ? new Map() : null;
    this.name = indexed ? "binary-heap+index" : "binary-heap";
    this.description = indexed
      ? "Binary min-heap with id->position map (O(log K) cancel)"
      : "Binary min-heap, spec-faithful (O(K) cancel)";
  }

  get size(): number {
    return this.heap.length;
  }

  #place(i: number, r: Reservation): void {
    this.heap[i] = r;
    if (this.pos) this.pos.set(r.id, i);
  }

  #siftUp(i: number): void {
    const h = this.heap;
    const item = h[i]!;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const parent = h[p]!;
      if (!less(item, parent)) break;
      this.#place(i, parent);
      i = p;
    }
    this.#place(i, item);
  }

  #siftDown(i: number): void {
    const h = this.heap;
    const n = h.length;
    const item = h[i]!;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const c = r < n && less(h[r]!, h[l]!) ? r : l;
      if (!less(h[c]!, item)) break;
      this.#place(i, h[c]!);
      i = c;
    }
    this.#place(i, item);
  }

  push(r: Reservation): void {
    this.heap.push(r);
    this.#siftUp(this.heap.length - 1);
  }

  peek(): Reservation | undefined {
    return this.heap[0];
  }

  popMin(): Reservation | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0]!;
    const last = h.pop()!;
    if (this.pos) this.pos.delete(top.id);
    if (h.length > 0) {
      this.#place(0, last);
      this.#siftDown(0);
    }
    return top;
  }

  remove(id: number): boolean {
    const h = this.heap;
    let i = -1;
    if (this.pos) {
      const p = this.pos.get(id);
      if (p === undefined) return false;
      i = p;
    } else {
      for (let j = 0; j < h.length; j++) if (h[j]!.id === id) { i = j; break; }
      if (i < 0) return false;
    }
    const removed = h[i]!;
    const last = h.pop()!;
    if (this.pos) this.pos.delete(removed.id);
    if (i < h.length) {
      this.#place(i, last);
      // The moved element may need to go either direction.
      this.#siftUp(i);
      const at = this.pos ? this.pos.get(last.id)! : h.indexOf(last);
      this.#siftDown(at);
    }
    return true;
  }
}
