import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "@libras/shared";
import { renderCopyLabels } from "../src/labels/render.ts";

const LABEL = { barcode: "3100000001", accessionNumber: "AC-0000001", title: "Introduction to Algorithms", callNumber: "QA76.6 .C67 2022" };

/** Every `<rect>` bar of the first SVG in a rendered page: [x, width] in modules. */
function bars(html: string): [number, number][] {
  const svg = /<svg[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
  return [...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)" height="1"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** The printable page of Copy labels that carries the 10-digit barcode the Librarian scans. */
describe("Copy label page", () => {
  it("draws each Copy's barcode as the Code 128 bars of its digits, quiet zones included, with the digits and accession number beneath", () => {
    const html = renderCopyLabels([LABEL]);

    // Code 128 subset C of 10 digits: Start C, 5 data symbols, check and Stop = 11 + 55 + 11 + 13 = 90 modules, plus 10 quiet modules each side = 110.
    const expected: [number, number][] = [];
    let x = CODE128_QUIET_ZONE_MODULES;
    encodeCode128C("3100000001").widths.forEach((width, index) => {
      if (index % 2 === 0) expected.push([x, width]);
      x += width;
    });
    assert.deepEqual(bars(html), expected);
    assert.match(html, /viewBox="0 0 110 1"/);
    assert.match(html, />3100000001</);
    assert.match(html, />AC-0000001</);
    assert.match(html, />Introduction to Algorithms</);
  });

  it("makes one label per Copy, and rejects a barcode that cannot be drawn instead of printing a bad label", () => {
    const html = renderCopyLabels([LABEL, { ...LABEL, barcode: "3100000002", accessionNumber: "AC-0000002" }]);
    assert.equal(html.match(/<svg/g)?.length, 2);
    assert.throws(() => renderCopyLabels([{ ...LABEL, barcode: "310000000" }]), /even number of digits/);
    assert.throws(() => renderCopyLabels([]), /at least one/i);
  });

  it("escapes the Book's title, so a title cannot inject markup into the page", () => {
    const html = renderCopyLabels([{ ...LABEL, title: `<script>alert(1)</script> & "more"` }]);
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;more&quot;/);
  });
});
