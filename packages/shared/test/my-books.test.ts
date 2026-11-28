import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { myBooksAttention, myBooksStartSegment } from "../src/index.ts";
import type { Hold, HoldStatus, Loan } from "../src/index.ts";

// 18 Nov 2026, 10:00 in Manila.
const NOW = new Date("2026-11-18T02:00:00.000Z");

/** The end of a library day in Manila, as the API writes a due date. */
const endOfLibraryDay = (day: string) => new Date(`${day}T23:59:59.999+08:00`).toISOString();

function loan(fields: { dueDay: string; overdue?: boolean; returned?: boolean }): Loan {
  return {
    id: crypto.randomUUID(),
    bookId: crypto.randomUUID(),
    bookTitle: "Operating System Concepts",
    bookAuthors: ["Silberschatz, Abraham"],
    accessionNumber: "TX0001",
    checkedOutAt: "2026-11-11T02:00:00.000Z",
    dueAt: endOfLibraryDay(fields.dueDay),
    returnedAt: fields.returned === true ? "2026-11-17T02:00:00.000Z" : null,
    overdue: fields.overdue ?? false,
    renewalCount: 0,
    renewal: null,
    fine: null,
  };
}

function hold(status: HoldStatus): Hold {
  return {
    id: crypto.randomUUID(),
    bookId: crypto.randomUUID(),
    bookTitle: "Introduction to Algorithms",
    bookAuthors: ["Cormen, Thomas H."],
    status,
    placedAt: "2026-11-15T02:00:00.000Z",
    pickupEndsAt: status === "ready" ? "2026-11-19T09:00:00.000Z" : null,
    queuePosition: status === "waiting" ? 1 : null,
  };
}

describe("what needs the Member on My Books", () => {
  it("is nothing with no Loans and no Holds", () => {
    assert.deepEqual(myBooksAttention({ loans: [], holds: [], now: NOW }), { loans: false, holds: false });
  });

  it("is the Holds when a Hold is ready for pickup", () => {
    assert.deepEqual(myBooksAttention({ loans: [], holds: [hold("waiting"), hold("ready")], now: NOW }), { loans: false, holds: true });
  });

  it("is not a waiting, borrowed, expired or cancelled Hold", () => {
    const holds = [hold("waiting"), hold("fulfilled"), hold("expired"), hold("cancelled")];
    assert.deepEqual(myBooksAttention({ loans: [], holds, now: NOW }), { loans: false, holds: false });
  });

  it("is the Loans when a Loan is due tomorrow by the library's calendar", () => {
    assert.deepEqual(myBooksAttention({ loans: [loan({ dueDay: "2026-11-19" })], holds: [], now: NOW }), { loans: true, holds: false });
  });

  it("counts tomorrow in Manila, not in UTC", () => {
    // 23:30 on 18 Nov in Manila (15:30 UTC): a Loan due on the 19th is still due tomorrow.
    const late = new Date("2026-11-18T15:30:00.000Z");
    assert.equal(myBooksAttention({ loans: [loan({ dueDay: "2026-11-19" })], holds: [], now: late }).loans, true);
    // 00:30 on 19 Nov in Manila (16:30 UTC on the 18th): the same Loan is now due today.
    const pastMidnight = new Date("2026-11-18T16:30:00.000Z");
    assert.equal(myBooksAttention({ loans: [loan({ dueDay: "2026-11-19" })], holds: [], now: pastMidnight }).loans, false);
  });

  it("is the Loans when an in-library Loan is due at closing today", () => {
    const inLibrary = { ...loan({ dueDay: "2026-11-18" }), dueAt: "2026-11-18T11:00:00.000Z" };
    assert.deepEqual(myBooksAttention({ loans: [inLibrary], holds: [], now: NOW }), { loans: true, holds: false });
  });

  it("is not a multi-day Loan due today or later than tomorrow", () => {
    const loans = [loan({ dueDay: "2026-11-18" }), loan({ dueDay: "2026-11-20" }), loan({ dueDay: "2026-11-25" })];
    assert.deepEqual(myBooksAttention({ loans, holds: [], now: NOW }), { loans: false, holds: false });
  });

  it("is the Loans when a Loan is overdue, as the API says", () => {
    assert.deepEqual(myBooksAttention({ loans: [loan({ dueDay: "2026-11-16", overdue: true })], holds: [], now: NOW }), {
      loans: true,
      holds: false,
    });
  });

  it("is not a returned Loan, even one that was due tomorrow", () => {
    assert.deepEqual(myBooksAttention({ loans: [loan({ dueDay: "2026-11-19", returned: true })], holds: [], now: NOW }), {
      loans: false,
      holds: false,
    });
  });

  it("is both when a Hold is ready and a Loan is overdue", () => {
    const attention = myBooksAttention({ loans: [loan({ dueDay: "2026-11-10", overdue: true })], holds: [hold("ready")], now: NOW });
    assert.deepEqual(attention, { loans: true, holds: true });
  });
});

describe("the segment My Books opens on", () => {
  it("is Holds when a Hold is ready for pickup", () => {
    assert.equal(myBooksStartSegment([hold("waiting"), hold("ready")]), "holds");
  });

  it("is Loans for in-library-only Members even when a ready Hold row exists", () => {
    assert.equal(myBooksStartSegment([hold("ready")], { inLibraryOnly: true }), "loans");
  });

  it("is Loans otherwise", () => {
    assert.equal(myBooksStartSegment([]), "loans");
    assert.equal(myBooksStartSegment([hold("waiting"), hold("expired")]), "loans");
  });
});
