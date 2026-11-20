import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inLibraryLoanDueAt, isWithinLibraryHours, libraryHoursOn } from "../src/index.ts";

describe("library operating hours", () => {
  it("opens 8:00 AM to 7:00 PM on weekdays (Manila UTC+8)", () => {
    // 2026-11-20 is a Friday in Manila.
    const morning = new Date("2026-11-20T08:00:00+08:00");
    const midday = new Date("2026-11-20T14:30:00+08:00");
    const justBeforeClose = new Date("2026-11-20T18:59:59+08:00");
    const atClose = new Date("2026-11-20T19:00:00+08:00");
    const beforeOpen = new Date("2026-11-20T07:59:59+08:00");

    assert.equal(isWithinLibraryHours(morning), true);
    assert.equal(isWithinLibraryHours(midday), true);
    assert.equal(isWithinLibraryHours(justBeforeClose), true);
    assert.equal(isWithinLibraryHours(atClose), false);
    assert.equal(isWithinLibraryHours(beforeOpen), false);

    assert.equal(inLibraryLoanDueAt(midday)?.toISOString(), "2026-11-20T11:00:00.000Z");
    assert.equal(inLibraryLoanDueAt(atClose), null);
    assert.equal(inLibraryLoanDueAt(beforeOpen), null);
  });

  it("opens 8:00 AM to 12:00 PM on Saturdays", () => {
    // 2026-11-21 is a Saturday in Manila.
    const morning = new Date("2026-11-21T09:15:00+08:00");
    const atNoon = new Date("2026-11-21T12:00:00+08:00");

    assert.equal(isWithinLibraryHours(morning), true);
    assert.equal(isWithinLibraryHours(atNoon), false);
    assert.equal(inLibraryLoanDueAt(morning)?.toISOString(), "2026-11-21T04:00:00.000Z");
    assert.equal(inLibraryLoanDueAt(atNoon), null);
  });

  it("is closed all day on Sundays, following the Manila calendar", () => {
    // 2026-11-22 is a Sunday in Manila; 09:00 Manila is 01:00 UTC Sunday.
    const sunday = new Date("2026-11-22T09:00:00+08:00");
    assert.equal(libraryHoursOn(sunday), null);
    assert.equal(isWithinLibraryHours(sunday), false);
    assert.equal(inLibraryLoanDueAt(sunday), null);
  });
});
