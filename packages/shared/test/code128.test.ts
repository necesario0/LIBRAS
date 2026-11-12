import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "../src/index.ts";

/** Bars as 1 and spaces as 0, one character per module, quiet zones left out. */
function modulesOf(digits: string): string {
  return encodeCode128C(digits)
    .widths.map((width, index) => (index % 2 === 0 ? "1" : "0").repeat(width))
    .join("");
}

// Expected modules come from bwip-js 4.5.1 (an independent Code 128 encoder),
// and were decoded back by a scanner library, so they are not derived from this code.
const reference: Record<string, string> = {
  "482109375512":
    "11010011100111011101101101110010011001001000100011010001110100011010110011100101110111101100011101011",
  "000000000000":
    "11010011100110110011001101100110011011001100110110011001101100110011011001100110011001101100011101011",
  "999999999999":
    "11010011100101110111101011101111010111011110101110111101011101111010111011110110111001001100011101011",
  "012345678901":
    "11010011100110011011001110110111010111011000100001011001101101111011001101100100011110101100011101011",
};

describe("Code 128 subset C encoding", () => {
  for (const [digits, expected] of Object.entries(reference)) {
    it(`encodes ${digits} the way an independent encoder does`, () => {
      assert.equal(modulesOf(digits), expected);
    });
  }

  it("starts and ends with a bar and counts its modules", () => {
    const symbol = encodeCode128C("482109375512");
    assert.equal(symbol.widths.length % 2, 1);
    assert.equal(
      symbol.widths.reduce((sum, width) => sum + width, 0),
      symbol.modules,
    );
    // Start, six digit pairs, check symbol: 11 modules each; stop: 13.
    assert.equal(symbol.modules, 8 * 11 + 13);
  });

  it("asks for a quiet zone of ten modules on each side", () => {
    assert.equal(CODE128_QUIET_ZONE_MODULES, 10);
  });

  it("refuses anything that is not an even number of digits", () => {
    for (const bad of ["", "123", "12a4", "12 34", "１２"]) {
      assert.throws(() => encodeCode128C(bad), RangeError, bad);
    }
  });
});
