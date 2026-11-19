import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notClearedNotice } from "../src/index.ts";
import type { ClearanceLoan, UnsettledFine } from "../src/index.ts";

const loan = (bookTitle: string): ClearanceLoan => ({
  loanId: bookTitle,
  bookTitle,
  accessionNumber: "LT-1",
  dueAt: "2026-11-19T15:59:59.999Z",
  overdue: false,
});

const fine = (amountCentavos: number): UnsettledFine => ({
  loanId: String(amountCentavos),
  bookTitle: "Settle Me",
  accessionNumber: "LT-2",
  amountCentavos,
  daysLate: 2,
  returnedAt: "2026-11-21T07:00:00.000Z",
});

describe("What a Member who is not cleared reads when they ask to delete their account", () => {
  it("names every Loan still out by its Book, as in the approved preview", () => {
    assert.deepEqual(notClearedNotice({ loansOut: [loan("Clean Code"), loan("Calculus: Early Transcendentals")], unsettledFines: [] }), {
      title: "Return your books first",
      message: "You can delete your account once you are cleared. You still have 2 Loans out: Clean Code and Calculus: Early Transcendentals.",
    });
  });

  it("lists three Books with commas", () => {
    assert.equal(
      notClearedNotice({ loansOut: [loan("A"), loan("B"), loan("C")], unsettledFines: [] }).message,
      "You can delete your account once you are cleared. You still have 3 Loans out: A, B and C.",
    );
  });

  it("names one unsettled Fine and its amount, and asks to settle it first", () => {
    assert.deepEqual(notClearedNotice({ loansOut: [], unsettledFines: [fine(1000)] }), {
      title: "Settle your Fines first",
      message: "You can delete your account once you are cleared. You still have an unsettled Fine of PHP 10. Settle it at the library desk.",
    });
  });

  it("totals several Fines", () => {
    assert.equal(
      notClearedNotice({ loansOut: [], unsettledFines: [fine(1000), fine(550)] }).message,
      "You can delete your account once you are cleared. You still have 2 unsettled Fines, PHP 15.50 in all. Settle them at the library desk.",
    );
  });

  it("names the Loans first when both stand in the way", () => {
    assert.deepEqual(notClearedNotice({ loansOut: [loan("Clean Code")], unsettledFines: [fine(500)] }), {
      title: "Return your books first",
      message:
        "You can delete your account once you are cleared. You still have 1 Loan out: Clean Code. You also have an unsettled Fine of PHP 5. Settle it at the library desk.",
    });
  });
});
