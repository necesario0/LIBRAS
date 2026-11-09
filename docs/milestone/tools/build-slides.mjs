// Renders slides.html to slides/slides.pdf (16:9 pages) and slides/slide-NN.png (used by the DOCX).
// Requires Chrome and Python with PyMuPDF (pip install pymupdf).
//   node build-slides.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const slidesDir = path.join(here, "..", "slides");
fs.mkdirSync(slidesDir, { recursive: true });
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pdf = path.join(slidesDir, "slides.pdf");

execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(path.join(here, "slides.html")).href], { stdio: "ignore" });

const py = `
import pymupdf, sys
doc = pymupdf.open(sys.argv[1])
for i, page in enumerate(doc):
    page.get_pixmap(dpi=144).save(sys.argv[2] + "/slide-%02d.png" % (i + 1))
print("slides:", len(doc))
`;
execFileSync("python", ["-c", py, pdf, slidesDir], { stdio: "inherit" });
