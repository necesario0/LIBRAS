import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announcementDatesLine } from "../src/announcements.ts";

describe("announcementDatesLine", () => {
  it("names the first and last day and where it happens", () => {
    assert.equal(announcementDatesLine("2026-11-17", "2026-11-28"), "Nov 17, 2026 to Nov 28, 2026 · University Library");
  });

  it("names one day for a one-day Announcement", () => {
    assert.equal(announcementDatesLine("2026-12-01", "2026-12-01"), "Dec 1, 2026 · University Library");
  });
});
