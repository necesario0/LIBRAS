import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookSheetSnapBounds, clampBookSheetTop, resolveBookSheetRelease } from "../src/book-sheet.ts";

describe("bookSheetSnapBounds", () => {
  it("computes fullscreen, default, and closed top offsets from screen height", () => {
    assert.deepEqual(bookSheetSnapBounds(874), {
      fullTop: 0,
      defaultTop: 200,
      closedTop: 874,
    });
  });
});

describe("clampBookSheetTop", () => {
  it("clamps dragged position between fullscreen (0) and closed (height)", () => {
    assert.equal(clampBookSheetTop(-40, 874), 0);
    assert.equal(clampBookSheetTop(120, 874), 120);
    assert.equal(clampBookSheetTop(950, 874), 874);
  });
});

describe("resolveBookSheetRelease", () => {
  it("expands to fullscreen when dragged up from default", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 130, velocityY: -0.1, height: 874 }),
      "expanded",
    );
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 185, velocityY: -0.8, height: 874 }),
      "expanded",
    );
  });

  it("closes when dragged down past dismiss threshold from default", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 360, velocityY: 0.1, height: 874 }),
      "closed",
    );
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 220, velocityY: 0.9, height: 874 }),
      "closed",
    );
  });

  it("returns to default for a small drag in either direction from default", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 175, velocityY: -0.1, height: 874 }),
      "default",
    );
    assert.equal(
      resolveBookSheetRelease({ state: "default", top: 235, velocityY: 0.1, height: 874 }),
      "default",
    );
  });

  it("collapses a quick flick down from fullscreen to default without accidentally dismissing", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "expanded", top: 90, velocityY: 0.15, height: 874 }),
      "default",
    );
    assert.equal(
      resolveBookSheetRelease({ state: "expanded", top: 320, velocityY: 1.4, height: 874 }),
      "default",
    );
  });

  it("closes only when dragged deep into the bottom zone from fullscreen", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "expanded", top: 470, velocityY: 0.4, height: 874 }),
      "closed",
    );
  });

  it("stays fullscreen for small downward nudges from fullscreen", () => {
    assert.equal(
      resolveBookSheetRelease({ state: "expanded", top: 24, velocityY: 0.1, height: 874 }),
      "expanded",
    );
  });
});
