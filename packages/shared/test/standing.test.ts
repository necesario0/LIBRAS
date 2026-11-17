import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { goodStandingNotice } from "../src/index.ts";

describe("What the app tells a Member who is not in Good standing", () => {
  it("names an overdue Loan and says what to do", () => {
    assert.equal(
      goodStandingNotice(["overdue_loan"]),
      "You cannot borrow, place a Hold or renew a Loan while you have an overdue Loan. Return it to the library desk and settle its Fine there.",
    );
  });

  it("names an unsettled Fine and says what to do", () => {
    assert.equal(
      goodStandingNotice(["unsettled_fine"]),
      "You cannot borrow, place a Hold or renew a Loan while you have an unsettled Fine. Settle it at the library desk.",
    );
  });

  it("names both when both stand in the way", () => {
    assert.equal(
      goodStandingNotice(["overdue_loan", "unsettled_fine"]),
      "You cannot borrow, place a Hold or renew a Loan while you have an overdue Loan and an unsettled Fine. Return the overdue Loan and settle what you owe at the library desk.",
    );
  });
});
