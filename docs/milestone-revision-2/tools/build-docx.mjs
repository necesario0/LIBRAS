// Builds PBL-Milestone-1-Revision-2.docx from the Markdown source, with the summary slides as
// full-page images in a landscape section at the end.
//   node build-docx.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun, LevelFormat,
  Packer, PageBreak, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType,
} from "docx";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const md = fs.readFileSync(path.join(root, "PBL-Milestone-1-Revision-2.md"), "utf8").replace(/\r\n/g, "\n").replace("<!-- SLIDES -->", "");
const outFile = path.join(root, "PBL-Milestone-1-Revision-2.docx");

const FONT = "Calibri";
const MONO = "Consolas";
const TEXT_WIDTH = 9638; // A4 portrait (11906) minus two 1134 margins, in twips

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// ---------------------------------------------------------------- inline content
function inline(tokens, style = {}) {
  const out = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "text":
      case "escape":
        if (t.tokens && t.tokens.length) out.push(...inline(t.tokens, style));
        else out.push(new TextRun({ text: decode(t.text), font: FONT, ...style }));
        break;
      case "strong": out.push(...inline(t.tokens, { ...style, bold: true })); break;
      case "em": out.push(...inline(t.tokens, { ...style, italics: true })); break;
      case "del": out.push(...inline(t.tokens, { ...style, strike: true })); break;
      case "codespan":
        out.push(new TextRun({ text: decode(t.text), font: MONO, size: (style.size ?? 21) - 2, shading: { type: ShadingType.CLEAR, fill: "EFEFEF" }, bold: style.bold, italics: style.italics }));
        break;
      case "br": out.push(new TextRun({ break: 1 })); break;
      case "link":
        out.push(new ExternalHyperlink({ link: t.href, children: inline(t.tokens, { ...style, color: "1F4E9E", underline: {} }) }));
        break;
      case "html":
        if (/^<br\s*\/?>$/i.test(t.raw.trim())) out.push(new TextRun({ break: 1 }));
        break;
      default:
        if (t.raw) out.push(new TextRun({ text: decode(t.raw), font: FONT, ...style }));
    }
  }
  return out;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function imageRun(file, widthPx) {
  const { w, h } = pngSize(file);
  return new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) } });
}

// ---------------------------------------------------------------- blocks
const numberedRefs = [];
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

function listBlocks(list, level, ref) {
  const out = [];
  for (const item of list.items) {
    for (const t of item.tokens) {
      if (t.type === "text" || t.type === "paragraph") {
        out.push(new Paragraph({ numbering: { reference: ref, level }, children: inline(t.tokens ?? [{ type: "text", text: t.text }]), spacing: { after: 60 } }));
      } else if (t.type === "list") {
        const childRef = t.ordered ? newNumbered() : "bullets";
        out.push(...listBlocks(t, Math.min(level + 1, 3), childRef));
      } else if (t.type === "code") {
        out.push(...codeBlock(t.text));
      }
    }
  }
  return out;
}
function newNumbered() {
  const ref = `num-${numberedRefs.length + 1}`;
  numberedRefs.push(ref);
  return ref;
}

function codeBlock(text) {
  const lines = text.replace(/\t/g, "    ").split("\n");
  return lines.map((line, i) => new Paragraph({
    keepLines: true,
    spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 120 : 0, line: 240 },
    shading: { type: ShadingType.CLEAR, fill: "F4F4F4" },
    border: i === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 2 } } : i === lines.length - 1 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 2 } } : undefined,
    children: [new TextRun({ text: line === "" ? " " : line, font: MONO, size: 16 })],
  }));
}

function plainLen(tokens) {
  let n = 0;
  for (const t of tokens ?? []) n += t.tokens ? plainLen(t.tokens) : (t.text ?? t.raw ?? "").length;
  return n;
}

function tableBlock(tok) {
  const cols = tok.header.length;
  const weights = Array.from({ length: cols }, (_, c) => {
    const lens = [tok.header[c], ...tok.rows.map((r) => r[c])].map((cell) => plainLen(cell.tokens));
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const max = Math.max(...lens);
    return Math.min(60, Math.max(8, 0.6 * avg + 0.4 * Math.min(max, 80)));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / total) * TEXT_WIDTH));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mkCell = (cell, c, header) => new TableCell({
    width: { size: widths[c], type: WidthType.DXA },
    borders,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: header ? { type: ShadingType.CLEAR, fill: "E8E8E8" } : undefined,
    children: [new Paragraph({ spacing: { after: 0 }, children: inline(cell.tokens, { size: 17, bold: header || undefined }) })],
  });
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: tok.header.map((cell, c) => mkCell(cell, c, true)) }),
      ...tok.rows.map((row) => new TableRow({ cantSplit: true, children: row.map((cell, c) => mkCell(cell, c, false)) })),
    ],
  });
}

function blocks(tokens) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading":
        out.push(new Paragraph({ heading: HEADINGS[Math.min(t.depth, 4) - 1], keepNext: true, children: inline(t.tokens) }));
        break;
      case "paragraph": {
        const img = t.tokens.find((x) => x.type === "image");
        if (img && t.tokens.length === 1) {
          const file = path.resolve(root, img.href);
          out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children: [imageRun(file, 600)] }));
        } else {
          const onlyStrong = t.tokens.length === 1 && t.tokens[0].type === "strong";
          out.push(new Paragraph({ keepNext: onlyStrong || undefined, spacing: { after: 120 }, children: inline(t.tokens) }));
        }
        break;
      }
      case "list": {
        const ref = t.ordered ? newNumbered() : "bullets";
        out.push(...listBlocks(t, 0, ref));
        out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        break;
      }
      case "code": out.push(...codeBlock(t.text)); break;
      case "table": out.push(tableBlock(t), new Paragraph({ spacing: { after: 120 }, children: [] })); break;
      case "blockquote": {
        for (const q of t.tokens) {
          if (q.type === "paragraph") {
            out.push(new Paragraph({
              spacing: { before: 60, after: 120 }, indent: { left: 240 },
              shading: { type: ShadingType.CLEAR, fill: "F3F3F3" },
              border: { left: { style: BorderStyle.SINGLE, size: 24, color: "888888", space: 8 } },
              children: inline(q.tokens),
            }));
          }
        }
        break;
      }
      case "space": case "html": case "hr": break;
      default: break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- document
const tokens = marked.lexer(md, { gfm: true });
const body = blocks(tokens);

const slideChildren = [];
for (let i = 1; i <= 12; i++) {
  const file = path.join(root, "slides", `slide-${String(i).padStart(2, "0")}.png`);
  slideChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [imageRun(file, 980)] }));
  if (i < 12) slideChildren.push(new Paragraph({ children: [new PageBreak()] }));
}

const footer = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "Project LIBRAS - PBL Milestone 1 (Revision 2) - page ", font: FONT, size: 16, color: "555555" }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "555555" }),
    ],
  })],
});

const levelsFor = (fmt, text) => Array.from({ length: 4 }, (_, level) => ({
  level, format: fmt, text: fmt === LevelFormat.BULLET ? (level % 2 === 0 ? "•" : "–") : `%${level + 1}.`, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
}));

const doc = new Document({
  creator: "Group 1, III-BCSAD, University of Makati",
  title: "PBL Milestone 1: Algorithm Architecture Specification and Software Engineering Proposal (Revision 2)",
  subject: "Project LIBRAS",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 40, bold: true, font: FONT }, paragraph: { spacing: { before: 120, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "222222", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: FONT }, paragraph: { spacing: { before: 360, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } } } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 80 } } },
      { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: FONT }, paragraph: { spacing: { before: 200, after: 60 } } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: levelsFor(LevelFormat.BULLET) },
      ...numberedRefs.map((reference) => ({ reference, levels: levelsFor(LevelFormat.DECIMAL) })),
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: footer },
      children: body,
    },
    {
      properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 567, bottom: 567, left: 567, right: 567 } } },
      children: slideChildren,
    },
  ],
});

fs.writeFileSync(outFile, await Packer.toBuffer(doc));
console.log("wrote", outFile, "numbered lists:", numberedRefs.length);
