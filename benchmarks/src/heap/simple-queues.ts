import { less } from "./types.ts";
import type { Dispatcher, Reservation } from "./types.ts";

/**
 * Sorted array kept in DESCENDING order so popMin is an O(1) pop from the end.
 * Insert is O(K) (binary search + splice), cancel is O(log K) search + O(K) shift.
 * Models "what if we just keep the queue sorted", including how a SQL
 * ORDER BY priority LIMIT 1 behaves on an indexed table.
 */
export class SortedArrayDispatcher implements Dispatcher {
  readonly name = "sorted-array";
  readonly description = "Sorted array (descending), O(K) insert, O(1) pop";
  readonly supportsFastRemove = false;
  arr: Reservation[] = [];

  get size(): number {
    return this.arr.length;
  }

  #lowerBound(r: Reservation): number {
    // first index whose element is NOT greater-priority-than r in descending order
    let lo = 0;
    let hi = this.arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (less(r, this.arr[mid]!)) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  push(r: Reservation): void {
    this.arr.splice(this.#lowerBound(r), 0, r);
  }
  peek(): Reservation | undefined {
    return this.arr[this.arr.length - 1];
  }
  popMin(): Reservation | undefined {
    return this.arr.pop();
  }
  remove(id: number): boolean {
    const a = this.arr;
    for (let i = 0; i < a.length; i++) if (a[i]!.id === id) { a.splice(i, 1); return true; }
    return false;
  }
}

/** Unsorted array: O(1) push, O(K) popMin and peek. The "do nothing clever" baseline. */
export class LinearScanDispatcher implements Dispatcher {
  readonly name = "linear-scan";
  readonly description = "Unsorted array, O(1) push, O(K) min scan";
  readonly supportsFastRemove = false;
  arr: Reservation[] = [];

  get size(): number {
    return this.arr.length;
  }
  push(r: Reservation): void {
    this.arr.push(r);
  }
  #minIndex(): number {
    const a = this.arr;
    if (a.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < a.length; i++) if (less(a[i]!, a[best]!)) best = i;
    return best;
  }
  peek(): Reservation | undefined {
    const i = this.#minIndex();
    return i < 0 ? undefined : this.arr[i];
  }
  popMin(): Reservation | undefined {
    const i = this.#minIndex();
    if (i < 0) return undefined;
    const top = this.arr[i]!;
    const last = this.arr.pop()!;
    if (i < this.arr.length) this.arr[i] = last; // order is irrelevant, swap-remove
    return top;
  }
  remove(id: number): boolean {
    const a = this.arr;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.id === id) {
        const last = a.pop()!;
        if (i < a.length) a[i] = last;
        return true;
      }
    }
    return false;
  }
}
