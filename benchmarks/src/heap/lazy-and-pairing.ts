import { less } from "./types.ts";
import type { Dispatcher, Reservation } from "./types.ts";

/**
 * Binary heap with lazy deletion: cancel just marks the id dead (O(1)); dead entries
 * are discarded when they reach the top. Common production trick, but `size` and
 * `peek` must skip tombstones, and dead entries hold memory until popped.
 */
export class LazyHeapDispatcher implements Dispatcher {
  readonly name = "binary-heap+lazy-delete";
  readonly description = "Binary min-heap, cancel = tombstone, cleaned on pop/peek";
  readonly supportsFastRemove = true;
  heap: Reservation[] = [];
  live = new Set<number>();

  get size(): number {
    return this.live.size;
  }

  push(r: Reservation): void {
    const h = this.heap;
    h.push(r);
    this.live.add(r.id);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(r, h[p]!)) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = r;
  }

  #popRaw(): Reservation | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0]!;
    const last = h.pop()!;
    const n = h.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && less(h[r]!, h[l]!) ? r : l;
        if (!less(h[c]!, last)) break;
        h[i] = h[c]!;
        i = c;
      }
      h[i] = last;
    }
    return top;
  }

  #skipDead(): void {
    while (this.heap.length > 0 && !this.live.has(this.heap[0]!.id)) this.#popRaw();
  }

  peek(): Reservation | undefined {
    this.#skipDead();
    return this.heap[0];
  }

  popMin(): Reservation | undefined {
    this.#skipDead();
    const top = this.#popRaw();
    if (top) this.live.delete(top.id);
    return top;
  }

  remove(id: number): boolean {
    return this.live.delete(id);
  }
}

// Pairing heap (Fredman et al. 1986): simple, fast in practice, O(1) insert and merge.
interface PNode {
  r: Reservation;
  child: PNode | null;
  sibling: PNode | null;
}

/** Pairing heap with lazy deletion for cancels. */
export class PairingHeapDispatcher implements Dispatcher {
  readonly name = "pairing-heap+lazy-delete";
  readonly description = "Pairing heap, O(1) insert, amortised O(log K) pop, cancel = tombstone";
  readonly supportsFastRemove = true;
  root: PNode | null = null;
  live = new Set<number>();

  get size(): number {
    return this.live.size;
  }

  push(r: Reservation): void {
    this.live.add(r.id);
    const node: PNode = { r, child: null, sibling: null };
    this.root = PairingHeapDispatcher.#link(this.root, node);
  }

  // Clean link: smaller root adopts the other as its first child.
  static #link(a: PNode | null, b: PNode | null): PNode | null {
    if (!a) return b;
    if (!b) return a;
    let small = a, large = b;
    if (less(b.r, a.r)) { small = b; large = a; }
    large.sibling = small.child;
    small.child = large;
    small.sibling = null;
    return small;
  }

  #popRaw(): Reservation | undefined {
    const root = this.root;
    if (!root) return undefined;
    // Two-pass pairing of root's children.
    const pairs: PNode[] = [];
    let c = root.child;
    while (c) {
      const a = c;
      const b = a.sibling;
      c = b ? b.sibling : null;
      a.sibling = null;
      if (b) b.sibling = null;
      pairs.push(PairingHeapDispatcher.#link(a, b)!);
    }
    let merged: PNode | null = null;
    for (let i = pairs.length - 1; i >= 0; i--) merged = PairingHeapDispatcher.#link(merged, pairs[i]!);
    this.root = merged;
    return root.r;
  }

  #skipDead(): void {
    while (this.root && !this.live.has(this.root.r.id)) this.#popRaw();
  }

  peek(): Reservation | undefined {
    this.#skipDead();
    return this.root?.r;
  }

  popMin(): Reservation | undefined {
    this.#skipDead();
    const top = this.#popRaw();
    if (top) this.live.delete(top.id);
    return top;
  }

  remove(id: number): boolean {
    return this.live.delete(id);
  }
}
