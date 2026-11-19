import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { studentNumberSchema } from "../src/index.ts";

describe("a UMAK student number", () => {
  it("starts with K or A, the two prefixes used on campus, then 7 to 9 digits", () => {
    for (const number of ["K12256165", "A12256165", "K1225616", "A122561650"]) {
      assert.equal(studentNumberSchema.safeParse(number).success, true, number);
    }
  });

  it("is stored in capitals and without surrounding spaces", () => {
    assert.equal(studentNumberSchema.parse(" a12256165 "), "A12256165");
    assert.equal(studentNumberSchema.parse("k12256165"), "K12256165");
  });

  it("refuses any other prefix, no prefix, or the wrong number of digits", () => {
    for (const number of ["B12256165", "12256165", "AK1225616", "A123456", "K1234567890", "A12-56165"]) {
      assert.equal(studentNumberSchema.safeParse(number).success, false, number);
    }
  });
});
