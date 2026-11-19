import { ACCOUNT_TYPE_LABELS } from "./accounts.ts";
import { formatPesos } from "./fines.ts";
import type { MemberLoanPolicyResponse } from "./loans.ts";
import { counted } from "./plural.ts";

/** One line of the Loan Policy table of Help and policies. */
export interface PolicyFact {
  label: string;
  value: string;
}

/** What Help and policies shows of the Member's Loan Policy. */
export interface LoanPolicyHelp {
  /** Whether the Account Type can borrow at all (a loan limit above zero). */
  canBorrow: boolean;
  heading: string;
  facts: PolicyFact[];
  /** Plain sentences under the table. */
  paragraphs: string[];
}

/**
 * Words the Member's own Loan Policy, as the API read it. Nothing here is a
 * constant of the library: every number comes from `policy`, so a policy the
 * library changes changes the screen. An Account Type with a loan limit of
 * zero is told it cannot borrow and what it can do instead.
 */
export function loanPolicyHelp(policy: MemberLoanPolicyResponse): LoanPolicyHelp {
  const heading = `Loan Policy for ${ACCOUNT_TYPE_LABELS[policy.accountType]}`;

  if (policy.loanLimit <= 0 || policy.loanPeriodDays === null) {
    return {
      canBorrow: false,
      heading,
      facts: [
        { label: "Borrowing", value: "Not available" },
        { label: "Reading in the library", value: "Yes, show your Digital ID" },
        { label: "Saved books", value: "Yes" },
      ],
      paragraphs: [
        "Your account type cannot borrow books, so there is nothing for you to return or renew.",
        "You can search the catalog, save books to find them again, and read them in the library.",
      ],
    };
  }

  const days = counted(policy.loanPeriodDays, "day");
  const renewals =
    policy.renewalLimit <= 0
      ? "Not allowed"
      : policy.renewalLimit === 1
        ? `1 per Loan, adds ${days}`
        : `${policy.renewalLimit} per Loan, each adds ${days}`;
  const fine =
    policy.fineDailyRateCentavos <= 0 || policy.fineCapCentavos <= 0
      ? "None"
      : `${formatPesos(policy.fineDailyRateCentavos)} a day, up to ${formatPesos(policy.fineCapCentavos)} per Loan`;

  return {
    canBorrow: true,
    heading,
    facts: [
      { label: "Books at a time", value: String(policy.loanLimit) },
      { label: "Loan period", value: days },
      { label: "Renewals", value: renewals },
      { label: "Late Fine", value: fine },
    ],
    paragraphs: [
      "A Renewal is refused once a Loan is overdue, while someone else has a Hold on the Book, or while you have an overdue Loan or an unsettled Fine.",
      "When a Copy you placed a Hold on comes back, we set it aside for you. Pick it up before the time shown on your Hold or it goes to the next Member in line.",
    ],
  };
}
