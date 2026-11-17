import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClearanceLoan, UnsettledFine } from "@libras/shared";
import { clearanceOf, goodStandingOf } from "../src/standing/index.ts";

const loan = (overdue: boolean): ClearanceLoan => ({
  loanId: "loan",
  bookTitle: "A Book",
  accessionNumber: "LT-1",
  dueAt: "2026-11-19T15:59:59.999Z",
  overdue,
});
const fine: UnsettledFine = {
  loanId: "late",
  bookTitle: "A Book",
  accessionNumber: "LT-2",
  amountCentavos: 500,
  daysLate: 1,
  returnedAt: "2026-11-20T07:00:00.000Z",
};

/**
 * Good standing is the rule between nothing and Clearance (
 * ADR 0010. Tickets that refuse a Loan, a Hold and a Renewal read it from here,
 * so the rule is pinned apart from any one of them.
 */
describe("Good standing, worked out from the same facts as Clearance", () => {
  it("holds with nothing out and nothing owed", () => {
    assert.deepEqual(goodStandingOf({ loansOut: [], unsettledFines: [] }), { inGoodStanding: true });
  });

  it("holds with a Loan out and on time, which Clearance does not allow", () => {
    const standing = { loansOut: [loan(false)], unsettledFines: [] };

    assert.deepEqual(goodStandingOf(standing), { inGoodStanding: true });
    assert.equal(clearanceOf(standing).cleared, false);
  });

  it("is lost to an overdue Loan", () => {
    assert.deepEqual(goodStandingOf({ loansOut: [loan(false), loan(true)], unsettledFines: [] }), {
      inGoodStanding: false,
      reasons: ["overdue_loan"],
    });
  });

  it("is lost to an unsettled Fine, even with no Loan out", () => {
    assert.deepEqual(goodStandingOf({ loansOut: [], unsettledFines: [fine] }), {
      inGoodStanding: false,
      reasons: ["unsettled_fine"],
    });
  });

  it("names both reasons, in a fixed order, when both apply", () => {
    assert.deepEqual(goodStandingOf({ loansOut: [loan(true)], unsettledFines: [fine] }), {
      inGoodStanding: false,
      reasons: ["overdue_loan", "unsettled_fine"],
    });
  });
});
