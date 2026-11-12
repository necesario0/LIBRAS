import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLibraryDate, isLoanOverdue, loanDueAt } from "../src/index.ts";

describe("a Loan's due date", () => {
  it("is the end of the library day (UTC+8) that many days after the checkout day", () => {
    // 12 Nov 2026, 10:00 in Manila. Seven days later is 19 Nov; the day ends at 15:59:59.999 UTC.
    assert.equal(loanDueAt(new Date("2026-11-12T02:00:00.000Z"), 7).toISOString(), "2026-11-19T15:59:59.999Z");
  });

  it("counts the checkout day by the library's calendar, not by UTC", () => {
    // 23:30 on 12 Nov in Manila is still 12 Nov there, and 00:30 on 13 Nov is the next day.
    assert.equal(loanDueAt(new Date("2026-11-12T15:30:00.000Z"), 7).toISOString(), "2026-11-19T15:59:59.999Z");
    assert.equal(loanDueAt(new Date("2026-11-12T16:30:00.000Z"), 7).toISOString(), "2026-11-20T15:59:59.999Z");
  });

  it("crosses a month and a year end", () => {
    assert.equal(loanDueAt(new Date("2026-12-28T04:00:00.000Z"), 7).toISOString(), "2027-01-04T15:59:59.999Z");
  });

  it("is overdue only once the due day has ended", () => {
    const due = new Date("2026-11-19T15:59:59.999Z");
    assert.equal(isLoanOverdue(due, new Date("2026-11-19T15:59:59.999Z")), false);
    assert.equal(isLoanOverdue(due, new Date("2026-11-19T16:00:00.000Z")), true);
  });
});

describe("printing a date of the library's calendar", () => {
  it("shows the day in Manila, whatever the reader's own time zone", () => {
    assert.equal(formatLibraryDate("2026-11-19T15:59:59.999Z"), "19 Nov 2026");
    assert.equal(formatLibraryDate("2026-11-19T16:00:00.000Z"), "20 Nov 2026");
    assert.equal(formatLibraryDate("2026-12-31T18:00:00.000Z"), "1 Jan 2027");
  });
});
