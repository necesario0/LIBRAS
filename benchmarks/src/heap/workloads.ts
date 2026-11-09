import { mulberry32, randInt } from "../prng.ts";
import { BinaryHeapDispatcher } from "./binary-heap.ts";
import { makeReservation } from "./types.ts";
import type { Reservation, Role } from "./types.ts";

/** Reservations with strictly increasing arrival times and a rough university role mix. */
export function makeReservations(count: number, seed: number): Reservation[] {
  const rng = mulberry32(seed);
  let t = 1_700_000_000_000;
  const out: Reservation[] = [];
  for (let i = 0; i < count; i++) {
    t += randInt(rng, 1, 5000);
    // Mostly students, some faculty/NTP, few visitors.
    const r = rng();
    const role: Role = r < 0.7 ? "Student" : r < 0.85 ? "Faculty" : r < 0.95 ? "NTP" : "Visitor";
    out.push(makeReservation(i, t, role));
  }
  return out;
}

export interface Op { kind: "push" | "pop" | "remove"; r?: Reservation; id?: number }

/**
 * Deterministic churn script: 40% push, 40% popMin, 20% cancel/expire a random queued hold.
 * Built with a reference queue so every replayed operation is valid.
 */
export function churnScript(k: number, opCount: number): { preload: Reservation[]; ops: Op[] } {
  const rng = mulberry32(3);
  const pool = makeReservations(k + opCount, 4);
  const model = new BinaryHeapDispatcher(true);
  const live: number[] = [];
  const pos = new Map<number, number>();
  const addLive = (id: number) => { pos.set(id, live.length); live.push(id); };
  const dropLive = (id: number) => {
    const i = pos.get(id)!; const last = live.pop()!;
    pos.delete(id);
    if (i < live.length) { live[i] = last; pos.set(last, i); }
  };
  const preload = pool.slice(0, k);
  for (const r of preload) { model.push(r); addLive(r.id); }
  let next = k;
  const ops: Op[] = [];
  while (ops.length < opCount && next < pool.length) {
    const x = rng();
    if (x < 0.4 || live.length === 0) {
      const r = pool[next++]!; ops.push({ kind: "push", r }); model.push(r); addLive(r.id);
    } else if (x < 0.8) {
      const top = model.popMin()!; ops.push({ kind: "pop" }); dropLive(top.id);
    } else {
      const id = live[randInt(rng, 0, live.length - 1)]!;
      ops.push({ kind: "remove", id }); model.remove(id); dropLive(id);
    }
  }
  return { preload, ops };
}
