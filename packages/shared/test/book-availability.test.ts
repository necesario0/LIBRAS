import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookAvailabilityLabel } from "../src/index.ts";

describe("the availability tag of the Book page", () => {
  it("counts the Copies on the shelf out of all of them", () => {
    assert.equal(bookAvailabilityLabel({ availableCopies: 2, totalCopies: 3 }), "2 of 3 available");
    assert.equal(bookAvailabilityLabel({ availableCopies: 1, totalCopies: 1 }), "1 of 1 available");
  });

  it("says none is available when every Copy is out or set aside", () => {
    assert.equal(bookAvailabilityLabel({ availableCopies: 0, totalCopies: 4 }), "None available");
  });

  it("says the library has no Copy of a Book without any", () => {
    assert.equal(bookAvailabilityLabel({ availableCopies: 0, totalCopies: 0 }), "No copies");
  });
});
