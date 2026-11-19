import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loanPolicyHelp } from "../src/index.ts";
import type { MemberLoanPolicyResponse } from "../src/index.ts";

const student: MemberLoanPolicyResponse = {
  accountType: "umak_student",
  loanLimit: 3,
  loanPeriodDays: 7,
  inLibraryOnly: false,
  renewalLimit: 1,
  fineDailyRateCentavos: 500,
  fineCapCentavos: 30_000,
};
const visitor: MemberLoanPolicyResponse = {
  accountType: "visitor",
  loanLimit: 3,
  loanPeriodDays: null,
  inLibraryOnly: true,
  renewalLimit: 0,
  fineDailyRateCentavos: 500,
  fineCapCentavos: 30_000,
};

describe("Help and policies: the Loan Policy in words", () => {
  it("words the seeded UMAK Student policy from its numbers", () => {
    const help = loanPolicyHelp(student);
    assert.equal(help.canBorrow, true);
    assert.equal(help.heading, "Loan Policy for UMAK Student");
    assert.deepEqual(help.facts, [
      { label: "Books at a time", value: "3" },
      { label: "Loan period", value: "7 days" },
      { label: "Renewals", value: "1 per Loan, adds 7 days" },
      { label: "Late Fine", value: "PHP 5 a day, up to PHP 300 per Loan" },
    ]);
  });

  it("follows the numbers when the library changes them", () => {
    const help = loanPolicyHelp({ ...student, loanLimit: 1, loanPeriodDays: 14, renewalLimit: 2, fineDailyRateCentavos: 250, fineCapCentavos: 10_000 });
    assert.deepEqual(help.facts, [
      { label: "Books at a time", value: "1" },
      { label: "Loan period", value: "14 days" },
      { label: "Renewals", value: "2 per Loan, each adds 14 days" },
      { label: "Late Fine", value: "PHP 2.50 a day, up to PHP 100 per Loan" },
    ]);
  });

  it("says plainly when Renewals or Fines do not exist", () => {
    const help = loanPolicyHelp({ ...student, renewalLimit: 0, fineDailyRateCentavos: 0, fineCapCentavos: 0 });
    const value = (label: string) => help.facts.find((fact) => fact.label === label)?.value;
    assert.equal(value("Renewals"), "Not allowed");
    assert.equal(value("Late Fine"), "None");
  });

  it("tells a Member who can borrow when a Renewal is refused and what happens to a Hold", () => {
    const text = loanPolicyHelp(student).paragraphs.join(" ");
    assert.match(text, /Renewal is refused/);
    assert.match(text, /Pickup Window|Pick it up/);
  });

  it("tells a Visitor plainly how in-library borrowing works within library hours", () => {
    const help = loanPolicyHelp(visitor);
    assert.equal(help.canBorrow, true);
    assert.equal(help.inLibraryOnly, true);
    assert.equal(help.heading, "Loan Policy for Visitor");
    assert.deepEqual(help.facts, [
      { label: "Books at a time", value: "3" },
      { label: "Loan period", value: "In-library use only (same day)" },
      { label: "Library hours", value: "Mon-Fri 8:00 AM - 7:00 PM, Sat 8:00 AM - 12:00 PM" },
      { label: "Renewals", value: "Not allowed" },
      { label: "Holds", value: "Not allowed" },
      { label: "Late Fine", value: "PHP 5 a day, up to PHP 300 per Loan" },
    ]);
    assert.match(help.paragraphs.join(" "), /before closing time/);
  });

  it("treats Alumni with the same in-library Loan Policy", () => {
    const help = loanPolicyHelp({ ...visitor, accountType: "alumni" });
    assert.equal(help.canBorrow, true);
    assert.equal(help.inLibraryOnly, true);
    assert.equal(help.heading, "Loan Policy for Alumni");
  });

  it("falls back to non-borrowing wording if loanLimit is zero", () => {
    const help = loanPolicyHelp({ ...visitor, loanLimit: 0, inLibraryOnly: false });
    assert.equal(help.canBorrow, false);
    assert.equal(help.inLibraryOnly, false);
    assert.match(help.paragraphs.join(" "), /cannot borrow/);
  });
});
