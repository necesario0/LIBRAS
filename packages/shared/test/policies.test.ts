import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { policyDocumentKind } from "../src/policies.ts";

describe("policyDocumentKind", () => {
  it("selects privacy when requested and defaults to terms otherwise", () => {
    assert.equal(policyDocumentKind("privacy"), "privacy");
    assert.equal(policyDocumentKind("terms"), "terms");
    assert.equal(policyDocumentKind(undefined), "terms");
    assert.equal(policyDocumentKind(["privacy"]), "privacy");
    assert.equal(policyDocumentKind("unknown"), "terms");
  });
});
