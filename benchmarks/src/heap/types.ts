// Reservation dispatch model from PBL Milestone 1:
//   PriorityScore(r) = t_r - W_factor(role)     (lower score = served first)
// Ties are broken by arrival sequence so ordering is deterministic (FIFO).

export type Role = "Faculty" | "Student" | "NTP" | "Visitor";

export const ROLE_WEIGHT_MS: Record<Role, number> = {
  Faculty: 86_400_000,
  Student: 0,
  NTP: 43_200_000,
  Visitor: -86_400_000,
};

export interface Reservation {
  id: number;
  /** Arrival epoch in ms; strictly increasing across reservations. */
  t: number;
  role: Role;
  /** Precomputed t - W_factor(role). */
  score: number;
  /** Arrival order, used as the tie-breaker. */
  seq: number;
}

export function makeReservation(id: number, t: number, role: Role): Reservation {
  return { id, t, role, score: t - ROLE_WEIGHT_MS[role], seq: id };
}

export function less(a: Reservation, b: Reservation): boolean {
  return a.score < b.score || (a.score === b.score && a.seq < b.seq);
}

/** A hold queue for one title. All implementations must produce the same service order. */
export interface Dispatcher {
  readonly name: string;
  readonly description: string;
  /** Does remove(id) run faster than a linear scan? Reported in results. */
  readonly supportsFastRemove: boolean;
  readonly size: number;
  push(r: Reservation): void;
  peek(): Reservation | undefined;
  popMin(): Reservation | undefined;
  /** Cancel/expire a specific reservation. Returns true if it was queued. */
  remove(id: number): boolean;
}
