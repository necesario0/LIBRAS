import type { Hold } from "./holds.ts";
import { isCurrentLoan, libraryDaysBetween } from "./loans.ts";
import type { Loan } from "./loans.ts";

/**
 * My Books: the app's tab for the Member's Loans and Holds (and Saved books). These rules decide what it opens on and when its tab shows a dot.
 * They read only the Loans and Holds the API already sent.
 */

/** The segments of My Books that hold circulation: the Member's Loans and their Holds. */
export type CirculationSegment = "loans" | "holds";

/** Every segment of My Books: Loans and Holds, then the Member's Saved books (no circulation, so never needs the Member). */
export type MyBooksSegment = CirculationSegment | "saved";

/** Which segments of My Books need the Member now: each one earns a dot, and the tab shows one when either does. Saved books never do. */
export type MyBooksAttention = Readonly<Record<CirculationSegment, boolean>>;

/**
 * What needs the Member: a Hold ready for pickup (the Holds), and a current
 * Loan that is overdue (the API's word, by its clock) or due tomorrow by the
 * library's calendar (the Loans). Nothing else does.
 */
export function myBooksAttention({ loans, holds, now }: { loans: readonly Loan[]; holds: readonly Hold[]; now: Date }): MyBooksAttention {
  const today = now.toISOString();
  return {
    loans: loans.some((loan) => isCurrentLoan(loan) && (loan.overdue || libraryDaysBetween(today, loan.dueAt) === 1)),
    holds: holds.some((hold) => hold.status === "ready"),
  };
}

/** My Books opens on Holds when a Hold is ready for pickup, since the Pickup Window is the easiest thing to miss, and on Loans otherwise. */
export function myBooksStartSegment(holds: readonly Hold[]): CirculationSegment {
  return holds.some((hold) => hold.status === "ready") ? "holds" : "loans";
}
