import { less } from "./types.ts";
import type { Dispatcher, Reservation } from "./types.ts";

/** d-ary min-heap with an id->position index. d = 4 is the common cache-friendlier choice. */
export class DaryHeapDispatcher implements Dispatcher {
  readonly name: string;
  readonly description: string;
  readonly supportsFastRemove = true;
  d: number;
  heap: Reservation[] = [];
  pos = new Map<number, number>();

  constructor(d = 4) {
    this.d = d;
    this.name = `${d}-ary-heap+index`;
    this.description = `${d}-ary min-heap with id->position map`;
  }

  get size(): number {
    return this.heap.length;
  }

  #siftUp(i: number): void {
    const h = this.heap;
    const item = h[i]!;
    while (i > 0) {
      const p = Math.floor((i - 1) / this.d);
      const parent = h[p]!;
      if (!less(item, parent)) break;
      h[i] = parent;
      this.pos.set(parent.id, i);
      i = p;
    }
    h[i] = item;
    this.pos.set(item.id, i);
  }

  #siftDown(i: number): void {
    const h = this.heap;
    const n = h.length;
    const item = h[i]!;
    for (;;) {
      const first = this.d * i + 1;
      if (first >= n) break;
      let best = first;
      const end = Math.min(first + this.d, n);
      for (let c = first + 1; c < end; c++) if (less(h[c]!, h[best]!)) best = c;
      if (!less(h[best]!, item)) break;
      h[i] = h[best]!;
      this.pos.set(h[i]!.id, i);
      i = best;
    }
    h[i] = item;
    this.pos.set(item.id, i);
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
    this.pos.delete(top.id);
    if (h.length > 0) {
      h[0] = last;
      this.pos.set(last.id, 0);
      this.#siftDown(0);
    }
    return top;
  }

  remove(id: number): boolean {
    const i = this.pos.get(id);
    if (i === undefined) return false;
    const h = this.heap;
    const last = h.pop()!;
    this.pos.delete(id);
    if (i < h.length) {
      h[i] = last;
      this.pos.set(last.id, i);
      this.#siftUp(i);
      this.#siftDown(this.pos.get(last.id)!);
    }
    return true;
  }
}
