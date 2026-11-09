// Builds PBL-Milestone-1-Algorithm-Architecture-Specification.pdf: the Markdown body (A4, via headless Chrome) followed by the
// 16:9 summary slides (slides/slides.pdf). Requires Chrome and Python with PyMuPDF (pip install pymupdf).
//   node build-pdf.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const mdPath = path.join(root, "PBL-Milestone-1-Algorithm-Architecture-Specification.md");
const outPdf = path.join(root, "PBL-Milestone-1-Algorithm-Architecture-Specification.pdf");
const slidesPdf = path.join(root, "slides", "slides.pdf");
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

let md = fs.readFileSync(mdPath, "utf8").replace(/\r\n/g, "\n");
md = md.replace("<!-- SLIDES -->", "");
let html = marked.parse(md, { gfm: true });
// Inline local images so the print step does not depend on file access rules.
html = html.replace(/src="([^"]+\.png)"/g, (m, src) => {
  const file = path.resolve(root, src);
  const b64 = fs.readFileSync(file).toString("base64");
  return `src="data:image/png;base64,${b64}"`;
});

const css = `
@page { size: A4; margin: 20mm 18mm 20mm 18mm;
  @bottom-center { content: "Project LIBRAS - PBL Milestone 1 - page " counter(page) " of " counter(pages); font: 8pt Arial, sans-serif; color: #555; } }
html { font-size: 10pt; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; line-height: 1.42; color: #111; }
h1 { font-size: 20pt; margin: 0 0 6pt; border-bottom: 2px solid #222; padding-bottom: 4pt; }
h2 { font-size: 14.5pt; margin: 22pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; break-after: avoid; }
h4 { font-size: 10.5pt; margin: 12pt 0 4pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 4px solid #888; background: #f3f3f3; }
blockquote p { margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 8.6pt; table-layout: auto; }
th, td { border: 1px solid #888; padding: 3pt 5pt; vertical-align: top; text-align: left; overflow-wrap: break-word; }
td:first-child, th:first-child { min-width: 26mm; }
th { background: #e8e8e8; }
tr { break-inside: avoid; }
pre { background: #f4f4f4; border: 1px solid #ccc; padding: 6pt 8pt; font-size: 7.9pt; line-height: 1.3;
      white-space: pre-wrap; overflow-wrap: anywhere; break-inside: auto; }
p:has(> strong:only-child) { break-after: avoid; }
code { font-family: Consolas, "Courier New", monospace; font-size: 0.92em; background: #f1f1f1; padding: 0 2pt; }
pre code { background: none; padding: 0; }
img { max-width: 100%; display: block; margin: 8pt auto 2pt; break-inside: avoid; }
em { color: #333; }
hr { border: 0; border-top: 1px solid #bbb; margin: 14pt 0; }
`;
const doc = `<!doctype html><html><head><meta charset="utf-8"><title>PBL Milestone 1: Algorithm Architecture Specification and Software Engineering Proposal</title><style>${css}</style></head><body>${html}</body></html>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "libras-pdf-"));
const htmlPath = path.join(tmp, "body.html");
const bodyPdf = path.join(tmp, "body.pdf");
fs.writeFileSync(htmlPath, doc);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${bodyPdf}`, pathToFileURL(htmlPath).href], { stdio: "ignore" });

const py = `
import pymupdf, sys
body = pymupdf.open(sys.argv[1])
slides = pymupdf.open(sys.argv[2])
body.insert_pdf(slides)
body.set_metadata({"title": "PBL Milestone 1: Algorithm Architecture Specification and Software Engineering Proposal",
                   "author": "Group 1, III-BCSAD, University of Makati", "subject": "Project LIBRAS"})
body.save(sys.argv[3], garbage=3, deflate=True)
print("pages:", len(body))
`;
execFileSync("python", ["-c", py, bodyPdf, slidesPdf, outPdf], { stdio: "inherit" });
console.log("wrote", outPdf);
