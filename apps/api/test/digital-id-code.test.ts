import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenFor, tokensEqual, windowOf } from "../src/digital-id/code.ts";

describe("Digital ID token derivation", () => {
  // RFC 6238 appendix B, HMAC-SHA-256 seed. The RFC's 8-digit values reduced modulo
  // 10^6 are the 6-digit tokens, because the dynamic truncation is the same.
  const seed = Buffer.from("12345678901234567890123456789012", "ascii");
  const vectors: [counter: number, rfcValue: string][] = [
    [1, "46119246"],
    [37037036, "68084774"],
    [41152263, "91819424"],
    [666666666, "77737706"],
  ];

  for (const [counter, rfcValue] of vectors) {
    it(`matches the RFC 6238 SHA-256 vector for counter ${counter}`, () => {
      assert.equal(tokenFor(seed, counter), rfcValue.slice(-6));
    });
  }

  it("counts 60-second windows from the Unix epoch", () => {
    assert.equal(windowOf(new Date("1970-01-01T00:00:59.999Z")), 0);
    assert.equal(windowOf(new Date("1970-01-01T00:01:00.000Z")), 1);
  });

  it("compares tokens of different lengths as different", () => {
    assert.equal(tokensEqual("123456", "123456"), true);
    assert.equal(tokensEqual("123456", "12345"), false);
    assert.equal(tokensEqual("123456", "123457"), false);
  });
});
