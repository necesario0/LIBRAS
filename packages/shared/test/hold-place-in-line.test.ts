import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { holdPlaceInLine } from "../src/holds.ts";

describe("holdPlaceInLine", () => {
  it("says next for the first place and an ordinal after that", () => {
    assert.equal(holdPlaceInLine(1), "You are next in line");
    assert.equal(holdPlaceInLine(2), "You are 2nd in line");
    assert.equal(holdPlaceInLine(3), "You are 3rd in line");
    assert.equal(holdPlaceInLine(4), "You are 4th in line");
  });

  it("writes 11th to 13th, and 21st, 22nd and 23rd, the English way", () => {
    assert.deepEqual(
      [11, 12, 13, 21, 22, 23, 101, 111].map(holdPlaceInLine),
      [
        "You are 11th in line",
        "You are 12th in line",
        "You are 13th in line",
        "You are 21st in line",
        "You are 22nd in line",
        "You are 23rd in line",
        "You are 101st in line",
        "You are 111th in line",
      ],
    );
  });
});
