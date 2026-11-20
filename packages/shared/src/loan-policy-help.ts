import { ACCOUNT_TYPE_LABELS } from "./accounts.ts";
import { formatPesos } from "./fines.ts";
import { LIBRARY_HOURS_SUMMARY } from "./library-hours.ts";
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
  /** Whether Loans are limited to same-day in-library use during library hours. */
  inLibraryOnly: boolean;
  heading: string;
  facts: PolicyFact[];
  /** Plain sentences under the table. */
  paragraphs: string[];
}

function fineSummary(policy: MemberLoanPolicyResponse): string {
  return policy.fineDailyRateCentavos <= 0 || policy.fineCapCentavos <= 0
    ? "None"
    : `${formatPesos(policy.fineDailyRateCentavos)} a day, up to ${formatPesos(policy.fineCapCentavos)} per Loan`;
}

/**
 * Words the Member's own Loan Policy, as the API read it. Nothing here is a
 * constant of the library: every number comes from `policy`, so a policy the
 * library changes changes the screen. An Account Type with a loan limit of
 * zero is told it cannot borrow and what it can do instead; an `inLibraryOnly`
 * Account Type sees its same-day library hours rules.
 */
export function loanPolicyHelp(policy: MemberLoanPolicyResponse): LoanPolicyHelp {
  const heading = `Loan Policy for ${ACCOUNT_TYPE_LABELS[policy.accountType]}`;

  if (policy.loanLimit <= 0 || (!policy.inLibraryOnly && policy.loanPeriodDays === null)) {
    return {
      canBorrow: false,
      inLibraryOnly: false,
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

  const fine = fineSummary(policy);
  if (policy.inLibraryOnly) {
    return {
      canBorrow: true,
      inLibraryOnly: true,
      heading,
      facts: [
        { label: "Books at a time", value: String(policy.loanLimit) },
        { label: "Loan period", value: "In-library use only (same day)" },
        { label: "Library hours", value: LIBRARY_HOURS_SUMMARY },
        { label: "Renewals", value: "Not allowed" },
        { label: "Holds", value: "Not allowed" },
        { label: "Late Fine", value: fine },
      ],
      paragraphs: [
        "Show your Digital ID at the desk during library hours to borrow an available Copy for reading inside the library.",
        "Return every Copy before closing time on the same day. Copies kept past closing become overdue and accrue a Fine.",
      ],
    };
  }

  const days = counted(policy.loanPeriodDays as number, "day");
  const renewals =
    policy.renewalLimit <= 0
      ? "Not allowed"
      : policy.renewalLimit === 1
        ? `1 per Loan, adds ${days}`
        : `${policy.renewalLimit} per Loan, each adds ${days}`;

  return {
    canBorrow: true,
    inLibraryOnly: false,
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
