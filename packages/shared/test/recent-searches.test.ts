import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRecentSearch, removeRecentSearch } from "../src/recent-searches.ts";

describe("recent searches", () => {
  it("puts the newest first", () => {
    assert.deepEqual(addRecentSearch(["b", "a"], "c"), ["c", "b", "a"]);
  });

  it("keeps 10 and drops the oldest", () => {
    const eleven = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const next = addRecentSearch(eleven, "new");
    assert.equal(next.length, 10);
    assert.equal(next[0], "new");
    assert.ok(!next.includes("s9"));
  });

  it("lists a search once whatever its case, moving it to the top with the new spelling", () => {
    assert.deepEqual(addRecentSearch(["Data", "algo"], "data"), ["data", "algo"]);
    assert.deepEqual(addRecentSearch(["x", "Data"], "DATA"), ["DATA", "x"]);
  });

  it("trims and squeezes spaces, and ignores a blank search", () => {
    assert.deepEqual(addRecentSearch([], "  data   structures "), ["data structures"]);
    assert.deepEqual(addRecentSearch(["a"], "   "), ["a"]);
  });

  it("removes one search whatever its case", () => {
    assert.deepEqual(removeRecentSearch(["Data", "algo"], "data"), ["algo"]);
  });
});
