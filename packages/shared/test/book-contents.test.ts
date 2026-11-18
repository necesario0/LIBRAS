import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentsChapters } from "../src/index.ts";

describe("the chapters of a Book's contents", () => {
  it("splits the catalog's table of contents on -- and trims each chapter", () => {
    assert.deepEqual(contentsChapters("Introduction -- The early years -- Colonial rule"), ["Introduction", "The early years", "Colonial rule"]);
    assert.deepEqual(contentsChapters("  One--Two  --  Three  "), ["One", "Two", "Three"]);
  });

  it("keeps contents without a separator as one paragraph, with its line breaks", () => {
    assert.deepEqual(contentsChapters("Part 1.\nPart 2."), ["Part 1.\nPart 2."]);
  });

  it("drops empty chapters made by a trailing or doubled separator", () => {
    assert.deepEqual(contentsChapters("One -- Two --"), ["One", "Two"]);
    assert.deepEqual(contentsChapters("One -- -- Two"), ["One", "Two"]);
  });

  it("gives no chapters for blank contents", () => {
    assert.deepEqual(contentsChapters("  "), []);
    assert.deepEqual(contentsChapters(" -- "), []);
  });
});
