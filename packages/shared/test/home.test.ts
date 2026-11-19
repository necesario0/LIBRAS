import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_SHELF_LENGTH, homeShelfCopy, topSubject } from "../src/home.ts";

describe("topSubject", () => {
  it("is the Subject borrowed most", () => {
    assert.equal(topSubject(["Law", "Computer Science", "Law", null]), "Law");
  });

  it("breaks a tie by the table order", () => {
    assert.equal(topSubject(["Law", "Computer Science"]), "Law");
    assert.equal(topSubject(["Computer Science", "Mathematics"]), "Mathematics");
  });

  it("is null with no Loans or no Subject", () => {
    assert.equal(topSubject([]), null);
    assert.equal(topSubject([null, null]), null);
  });
});

describe("homeShelfCopy", () => {
  it("names the college, the Subject and the library-wide versions", () => {
    assert.equal(homeShelfCopy({ kind: "new_arrivals" }).title, "New arrivals");
    assert.equal(homeShelfCopy({ kind: "popular", college: "CCIS" }).title, "Popular in CCIS");
    assert.equal(homeShelfCopy({ kind: "popular", college: null }).title, "Popular in the library");
    assert.equal(homeShelfCopy({ kind: "available_now", subject: "Law", canBorrow: true }).title, "Available now in Law");
    assert.equal(homeShelfCopy({ kind: "available_now", subject: null, canBorrow: true }).title, "On the shelf now");
    assert.match(homeShelfCopy({ kind: "available_now", subject: null, canBorrow: false }).subtitle, /in the library/);
  });

  it("holds ten Books to a shelf", () => {
    assert.equal(HOME_SHELF_LENGTH, 10);
  });
});
