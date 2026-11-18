import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memberFullName } from "../src/index.ts";

describe("a Member's full name", () => {
  it("is the first, middle and last name, in that order", () => {
    assert.equal(memberFullName({ firstName: "Maria", middleName: "Santos", lastName: "Cruz" }), "Maria Santos Cruz");
  });

  it("leaves out a middle name that is missing, null or empty, without a double space", () => {
    assert.equal(memberFullName({ firstName: "Cobby", lastName: "Baldonado" }), "Cobby Baldonado");
    assert.equal(memberFullName({ firstName: "Cobby", middleName: null, lastName: "Baldonado" }), "Cobby Baldonado");
    assert.equal(memberFullName({ firstName: "Cobby", middleName: "", lastName: "Baldonado" }), "Cobby Baldonado");
  });
});
