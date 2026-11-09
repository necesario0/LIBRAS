// Weighted decision matrix for the fuzzy-search candidates, computed from results/search.json.
//   npm run matrix      (run after npm run bench:search)
//
// Method (stated up front so the outcome cannot be tuned to a preferred answer):
//  - Gate: a candidate must return exactly the reference results (0 mismatches) and sustain the
//    SRS peak load of 250 queries/s on a single thread at k = 2. Only gate-passing candidates are scored.
//  - Latency score  = log-scale min-max of p95 (k = 2, words lexicon, N = 50,000): best = 100, worst = 0.
//  - Memory score   = log-scale min-max of retained MB after build: smallest = 100, largest = 0.
//  - Simplicity     = linear min-max of implementation LOC (non-blank, non-comment lines): fewest = 100, most = 0.
//  - Composite = weighted sum under three weightings, so the sensitivity of the ranking is visible.
//  REVISION NOTE: a first version scored value-ratio-to-best. That let one extreme candidate (and a 0.1 MB
//  linear-scan memory floor) squash every other score toward zero and produced an absurd memory-lean
//  ranking, so it was replaced by the min-max scoring above before any result was reported.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESULTS_DIR, mdTable, writeResult } from "./harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(RESULTS_DIR, "search.json"), "utf8"));
const words = data.words;

const FILES: Record<string, string> = {
  "trie-dp": "search/trie-dp.ts",
  "trie-dp-flat": "search/trie-dp-flat.ts",
  "linear-scan": "search/linear-scan.ts",
  "bk-tree": "search/bk-tree.ts",
  "symspell": "search/symspell.ts",
  "ngram-bigram": "search/ngram.ts",
};

function loc(file: string): number {
  const text = readFileSync(join(here, file), "utf8");
  let inBlock = false;
  let n = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (inBlock) { if (line.includes("*/")) inBlock = false; continue; }
    if (line.startsWith("/*")) { if (!line.includes("*/")) inBlock = true; continue; }
    if (line === "" || line.startsWith("//") || line.startsWith("import ")) continue;
    n++;
  }
  return n;
}

interface Row {
  name: string; p95: number; qps: number; mismatches: number; mb: number; loc: number;
  gate: boolean; latency: number; memory: number; simplicity: number;
}

const names = Object.keys(FILES);
const rows: Row[] = names.map((name) => {
  const k2 = words.perK["2"][name];
  const build = words.build.find((b: { name: string }) => b.name === name);
  return {
    name,
    p95: k2.p95 / 1e6,
    qps: k2.qps,
    mismatches: k2.mismatches,
    mb: Math.max(0.1, build.retainedBytes / 1024 / 1024),
    loc: loc(FILES[name]!),
    gate: false, latency: 0, memory: 0, simplicity: 0,
  };
});
for (const r of rows) r.gate = r.mismatches === 0 && r.qps >= 250;
const passing = rows.filter((r) => r.gate);
function logScore(value: number, vals: number[]): number {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) return 100;
  return (100 * (Math.log(hi) - Math.log(value))) / (Math.log(hi) - Math.log(lo));
}
function linScore(value: number, vals: number[]): number {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return hi === lo ? 100 : (100 * (hi - value)) / (hi - lo);
}
for (const r of passing) {
  r.latency = logScore(r.p95, passing.map((x) => x.p95));
  r.memory = logScore(r.mb, passing.map((x) => x.mb));
  r.simplicity = linScore(r.loc, passing.map((x) => x.loc));
}

const WEIGHTINGS = [
  { label: "Latency-first (agreed default)", w: { latency: 0.6, simplicity: 0.25, memory: 0.15 } },
  { label: "Balanced", w: { latency: 0.4, simplicity: 0.3, memory: 0.3 } },
  { label: "Memory-lean (small server instance)", w: { latency: 0.25, simplicity: 0.25, memory: 0.5 } },
];
const composite = (r: Row, w: (typeof WEIGHTINGS)[number]["w"]) =>
  r.latency * w.latency + r.simplicity * w.simplicity + r.memory * w.memory;

const out: string[] = [];
out.push("# Fuzzy search decision matrix\n");
out.push(`Computed from results/search.json (${data.env.date}). Inputs: words lexicon, N = ${words.n.toLocaleString("en-US")}, k = 2. Method is documented at the top of src/decision-matrix.ts.\n`);
out.push("## Inputs and gate\n");
out.push(mdTable(
  ["Candidate", "p95 latency (ms)", "Queries/s (1 thread)", "Retained (MB)", "Impl. LOC", "Passes gate?"],
  rows.map((r) => [r.name, r.p95.toFixed(2), Math.round(r.qps).toLocaleString("en-US"), r.mb.toFixed(1), r.loc, r.gate ? "yes" : "NO"]),
));
out.push("\nGate: zero result mismatches and at least 250 queries/s on one thread (the SRS peak load).\n");
out.push("## Scores (0-100, higher is better)\n");
out.push(mdTable(
  ["Candidate", "Latency", "Simplicity", "Memory", ...WEIGHTINGS.map((x) => x.label)],
  passing.map((r) => [
    r.name,
    r.latency.toFixed(0), r.simplicity.toFixed(0), r.memory.toFixed(0),
    ...WEIGHTINGS.map((x) => composite(r, x.w).toFixed(1)),
  ]),
));
out.push("\n## Ranking among candidates that pass the gate\n");
for (const x of WEIGHTINGS) {
  const ranked = rows.filter((r) => r.gate).sort((a, b) => composite(b, x.w) - composite(a, x.w));
  out.push(`- **${x.label}** (latency ${x.w.latency * 100}% / simplicity ${x.w.simplicity * 100}% / memory ${x.w.memory * 100}%): ${ranked.map((r) => `${r.name} (${composite(r, x.w).toFixed(1)})`).join(" > ")}`);
}
out.push("\nNote: scores are relative to the other passing candidates, not absolute. Every passing candidate is far inside the 1.0 s SLA, so a low latency score does not mean slow in practice; read the ranking together with the absolute numbers above.\n");
console.log(out.join("\n"));
writeResult("decision-matrix.md", out.join("\n"));
