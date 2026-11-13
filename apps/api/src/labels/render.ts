// The printable page of Copy labels: `npm run labels`. Each label carries the Copy's
// 10-digit barcode as Code 128 (the symbology the phone scanner and USB scanners read,
// ADR 0004), the digits beneath it, the accession number and the Book's title.
import { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "@libras/shared";

export interface CopyLabel {
  /** What the Librarian scans: an even number of digits. */
  barcode: string;
  accessionNumber: string;
  title: string;
  callNumber?: string | null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The bars as SVG rectangles in module units (1 module = 1 unit of width), with the quiet zone on both sides. */
function barcodeSvg(digits: string): string {
  const symbol = encodeCode128C(digits);
  const totalModules = symbol.modules + 2 * CODE128_QUIET_ZONE_MODULES;
  let x = CODE128_QUIET_ZONE_MODULES;
  const rects: string[] = [];
  symbol.widths.forEach((width, index) => {
    if (index % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="1"/>`);
    x += width;
  });
  return `<svg class="bars" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${digits}">${rects.join("")}</svg>`;
}

const STYLES = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  h1, p.note { margin: 0 0 4mm; font-size: 10pt; }
  .sheet { display: grid; grid-template-columns: repeat(2, 85mm); gap: 4mm; }
  .label { width: 85mm; height: 36mm; border: 0.2mm dashed #888; padding: 2mm 3mm; break-inside: avoid; display: flex; flex-direction: column; justify-content: space-between; }
  .title { font-size: 8.5pt; font-weight: bold; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .bars { display: block; width: 100%; height: 15mm; fill: #000; }
  .digits { font: 9pt "Courier New", monospace; letter-spacing: 0.25em; text-align: center; }
  .meta { display: flex; justify-content: space-between; font-size: 7pt; }
  @media print { p.note { display: none; } .label { border-color: #ccc; } }
`;

/** One self-contained HTML page with a label per Copy, ready to print at 100% scale on A4. */
export function renderCopyLabels(labels: readonly CopyLabel[]): string {
  if (labels.length === 0) throw new RangeError("Give at least one Copy to print a label for");
  const cells = labels.map((label) => {
    const meta = [label.callNumber ? `<span>${escapeHtml(label.callNumber)}</span>` : "<span></span>", `<span>${escapeHtml(label.accessionNumber)}</span>`].join("");
    return `<div class="label"><div class="title">${escapeHtml(label.title)}</div>${barcodeSvg(label.barcode)}<div class="digits">${escapeHtml(label.barcode)}</div><div class="meta">${meta}</div></div>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LIBRAS Copy labels</title>
<style>${STYLES}</style>
</head>
<body>
<p class="note">Print at 100% scale (no "fit to page"), on white matte paper. Each label is 85 x 36 mm.</p>
<div class="sheet">${cells.join("\n")}</div>
</body>
</html>
`;
}
