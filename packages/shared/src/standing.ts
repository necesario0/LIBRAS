/**
 * A Member's standing with the library (ADR 0010): Clearance and Good standing.
 * Neither is stored. The API works them out from the Member's Loans and Fines
 * each time it is asked, so they cannot disagree with the records behind them;
 * the app and the desk page only show them.
 */

/** A Fine that has been fixed at a return and not yet settled. */
export interface UnsettledFine {
  /** The id of the Loan the Fine is on, which names the Fine. */
  loanId: string;
  bookTitle: string;
  accessionNumber: string;
  /** What the Member owes, in centavos. */
  amountCentavos: number;
  /** Calendar days after the due date, the day of the return included. */
  daysLate: number;
  /** When the Copy came back and the Fine was fixed, ISO 8601. */
  returnedAt: string;
}

/** A Loan whose Copy is still out. */
export interface ClearanceLoan {
  loanId: string;
  bookTitle: string;
  accessionNumber: string;
  /** The end of the day the Copy is due, ISO 8601. */
  dueAt: string;
  /** Past its due date by the API's clock when it answered. */
  overdue: boolean;
}

/**
 * Whether a Member is cleared, and what stands in the way. A Member is cleared
 * when they have no Loan still out (on time or overdue) and no unsettled Fine:
 * `cleared` is true exactly when both lists are empty. A Loan that is out and
 * overdue has no Fine yet (a Fine is fixed at the return), so it appears in
 * `loansOut` only.
 */
export interface Clearance {
  cleared: boolean;
  /** Every Loan still out, the one due soonest first. */
  loansOut: ClearanceLoan[];
  /** Every Fine not yet settled, the earliest return first. */
  unsettledFines: UnsettledFine[];
}

/** What a Member owes in unsettled Fines, in centavos. The desk and the app both total it this way. */
export function totalOwedCentavos({ unsettledFines }: Pick<Clearance, "unsettledFines">): number {
  return unsettledFines.reduce((total, fine) => total + fine.amountCentavos, 0);
}

/**
 * The body of `GET /members/me/clearance`: what the Profile account screen
 * shows about the Member's standing. Both come from the same Loans and Fines.
 */
export interface ClearanceResponse {
  clearance: Clearance;
  /** Whether the Member may borrow, place a Hold and renew, and if not, every reason. */
  goodStanding: GoodStanding;
}

/**
 * Why a Member is not in Good standing, as the API names it: they have a Loan
 * that is out and overdue, or a Fine that is not settled. Good standing is
 * stricter about nothing else than these two (a Loan out and on time is fine).
 */
export const GOOD_STANDING_REFUSALS = ["overdue_loan", "unsettled_fine"] as const;
export type GoodStandingRefusal = (typeof GOOD_STANDING_REFUSALS)[number];

/** Whether a Member is in Good standing; when not, every reason, in the order of `GOOD_STANDING_REFUSALS`. */
export type GoodStanding = { inGoodStanding: true } | { inGoodStanding: false; reasons: GoodStandingRefusal[] };

/** What stands in the way, as the app names it in a sentence. */
const GOOD_STANDING_NAMES: Readonly<Record<GoodStandingRefusal, string>> = {
  overdue_loan: "an overdue Loan",
  unsettled_fine: "an unsettled Fine",
};

/**
 * What the Profile account screen tells a Member who is not in Good standing:
 * what they cannot do, every reason (`reasons` as the API gives them), and
 * what to do at the library desk.
 */
export function goodStandingNotice(reasons: readonly GoodStandingRefusal[]): string {
  const overdue = reasons.includes("overdue_loan");
  const owing = reasons.includes("unsettled_fine");
  const names = reasons.map((reason) => GOOD_STANDING_NAMES[reason]).join(" and ");
  const todo =
    overdue && owing
      ? "Return the overdue Loan and settle what you owe at the library desk."
      : overdue
        ? "Return it to the library desk and settle its Fine there."
        : "Settle it at the library desk.";
  return `You cannot borrow, place a Hold or renew a Loan while you have ${names}. ${todo}`;
}
