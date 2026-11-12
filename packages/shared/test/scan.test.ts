import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_MESSAGES, formatDigitalId, msUntilRefresh, readScan } from "../src/index.ts";

describe("reading a scan", () => {
  it("reads a Digital ID as a USB scanner sends it", () => {
    assert.deepEqual(readScan("482109375512"), { kind: "digital_id", code: "482109375512" });
  });

  it("reads a Digital ID typed the way the app prints it, and ignores the line ending", () => {
    assert.deepEqual(readScan("4821 0937 5512"), { kind: "digital_id", code: "482109375512" });
    assert.deepEqual(readScan("  482109375512\r\n"), { kind: "digital_id", code: "482109375512" });
  });

  it("rejects empty input", () => {
    assert.deepEqual(readScan("   "), { kind: "rejected", reason: "empty", message: SCAN_MESSAGES.empty });
  });

  it("rejects characters outside the whitelist before anything else looks at the input", () => {
    for (const raw of ["4821'; drop table members;--", "<script>", "4821\u00000937", "４８２１０９３７５５１２", "48210937551२"]) {
      assert.deepEqual(readScan(raw), { kind: "rejected", reason: "not_allowed", message: SCAN_MESSAGES.notAllowed }, raw);
    }
  });

  it("rejects input that is too long", () => {
    assert.equal(readScan("1".repeat(65)).kind, "rejected");
  });

  it("reads anything else inside the whitelist as a Copy: its barcode or its accession number", () => {
    assert.deepEqual(readScan("3100000042\r\n"), { kind: "copy", code: "3100000042" });
    assert.deepEqual(readScan(" AC-0000042 "), { kind: "copy", code: "AC-0000042" });
  });

  it("does not take a code of the wrong length or grouping for a Digital ID", () => {
    for (const raw of ["48210937551", "4821093755123", "48 2109 375512", "4821  0937 5512", "ABCD09375512"]) {
      assert.deepEqual(readScan(raw), { kind: "copy", code: raw }, raw);
    }
  });
});

describe("timing the next Digital ID", () => {
  const id = {
    code: "482109375512",
    windowStartsAt: "2026-11-24T08:00:00.000Z",
    refreshAt: "2026-11-24T08:01:00.000Z",
    serverTime: "2026-11-24T08:00:20.000Z",
  };

  it("counts from the API's clock, not the phone's: 40 s left when just received", () => {
    assert.equal(msUntilRefresh(id, 0), 40_000);
  });

  it("subtracts the time since the answer arrived, and never goes below zero", () => {
    assert.equal(msUntilRefresh(id, 15_500), 24_500);
    assert.equal(msUntilRefresh(id, 90_000), 0);
  });
});

describe("printing a Digital ID", () => {
  it("groups the digits in fours so a person can read and type them", () => {
    assert.equal(formatDigitalId("482109375512"), "4821 0937 5512");
  });
});
