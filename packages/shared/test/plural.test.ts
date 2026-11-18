import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { counted, plural, totalOwedCentavos } from "../src/index.ts";
import type { UnsettledFine } from "../src/index.ts";

describe("a count with its noun", () => {
  it("keeps the noun for exactly one and adds an s for zero and for many", () => {
    assert.equal(counted(1, "day"), "1 day");
    assert.equal(counted(0, "Loan"), "0 Loans");
    assert.equal(counted(3, "unsettled Fine"), "3 unsettled Fines");
    assert.equal(plural(1, "Loan"), "Loan");
    assert.equal(plural(2, "Loan"), "Loans");
  });
});

describe("what a Member owes in unsettled Fines", () => {
  const fine = (amountCentavos: number): UnsettledFine => ({
    loanId: String(amountCentavos),
    bookTitle: "A Book",
    accessionNumber: "LT-1",
    amountCentavos,
    daysLate: 1,
    returnedAt: "2026-11-20T07:00:00.000Z",
  });

  it("is zero with none and the sum of the amounts otherwise", () => {
    assert.equal(totalOwedCentavos({ unsettledFines: [] }), 0);
    assert.equal(totalOwedCentavos({ unsettledFines: [fine(500), fine(1_500), fine(250)] }), 2_250);
  });
});
