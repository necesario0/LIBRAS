import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPesos } from "../src/index.ts";

describe("a peso amount as LIBRAS writes it", () => {
  it("writes whole pesos without centavos", () => {
    assert.equal(formatPesos(500), "PHP 5");
    assert.equal(formatPesos(30_000), "PHP 300");
  });

  it("writes centavos with two digits when there are any", () => {
    assert.equal(formatPesos(250), "PHP 2.50");
    assert.equal(formatPesos(1_505), "PHP 15.05");
  });

  it("groups thousands", () => {
    assert.equal(formatPesos(123_456_700), "PHP 1,234,567");
  });
});
