#!/usr/bin/env node
// Fails when code uses a term that GLOSSARY.md lists under _Avoid_.
//
// Only the _Avoid_ terms that never have a legitimate other meaning in this
// codebase are checked. Words like "user", "request", "item" or "checkout"
// (as in "checkout time") are also _Avoid_ terms, but they have ordinary uses
// that a text match cannot tell apart, so code review covers those.
// Every term listed here must still be an _Avoid_ term in GLOSSARY.md, so the
// glossary stays the source of truth. A line that must use one of these words
// as data (a value the API is meant to reject, say) carries a `glossary-ok` comment.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CHECKED = ["patron", "borrower", "guest", "reservation", "booking", "library card", "visiting researcher", "borrowing rules"];

const glossary = readFileSync(join(import.meta.dirname, "..", "GLOSSARY.md"), "utf8");
const avoidTerms = new Set(
  glossary
    .split("\n")
    .filter((line) => line.startsWith("_Avoid_:"))
    .flatMap((line) => line.slice("_Avoid_:".length).split(","))
    .map((term) => term.replace(/\(.*?\)/g, "").trim().toLowerCase()),
);

const stale = CHECKED.filter((term) => !avoidTerms.has(term));
if (stale.length > 0) {
  console.error(`check-glossary: these terms are no longer _Avoid_ terms in GLOSSARY.md, remove them from CHECKED: ${stale.join(", ")}`);
  process.exit(1);
}

// "library card" also matches libraryCard, library_card and library-card.
const pattern = CHECKED.map((term) => term.replace(/ /g, "[ _-]?")).join("|");
let hits = "";
try {
  hits = execFileSync(
    "git",
    ["grep", "-n", "-i", "-I", "-E", pattern, "--", "apps", "packages", "supabase", "scripts", ":!scripts/check-glossary.mjs", ":!**/*.md"],
    { encoding: "utf8" },
  );
} catch (error) {
  // git grep exits 1 when nothing matches.
  if (error.status !== 1) throw error;
}

hits = hits
  .split("\n")
  .filter((line) => line && !line.includes("glossary-ok"))
  .join("\n");

if (hits) {
  console.error("check-glossary: code uses terms that GLOSSARY.md says to avoid. Use the glossary term instead:\n");
  console.error(hits);
  process.exit(1);
}
console.log("check-glossary: no avoided glossary terms in code.");
