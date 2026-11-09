// Decision rule for the fuzzy-search candidates, computed from results/search.json.
//   npm run matrix      (run after npm run bench:search)
//
// Rule (set by the team: "least latency, but light on memory"):
//  1. Correctness gate: zero result mismatches against the reference.
//  2. Throughput gate: at least 250 queries/s on one thread at k = 2 (the SRS peak load).
//  3. Memory gate: retained memory no more than 2x the smallest candidate that passes gates 1 and 2.
//  4. Among candidates passing all gates, rank by lowest p95 latency (k = 2, words lexicon, N = 50,000).
//     p95 values within 5% of each other count as a tie, broken by lower p99.
//
// HISTORY: an earlier version of this file scored a weighted blend of latency, simplicity and memory,
// which ranked SymSpell first (it is the fastest, at about 318 MB). The team then set a memory
// requirement, so the weighted blend was replaced by the gate-then-latency rule above.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR, mdTable, writeResult } from "./harness.ts";

const data = JSON.parse(readFileSync(join(RESULTS_DIR, "search.json"), "utf8"));
const words = data.words;
const names: string[] = Object.keys(words.perK["2"]);

interface Row { name: string; p95: number; p99: number; qps: number; mismatches: number; mb: number; exact: boolean; fast: boolean; light: boolean }
const rows: Row[] = names.map((name) => {
  const k2 = words.perK["2"][name];
  const build = words.build.find((b: { name: string }) => b.name === name);
  return {
    name, p95: k2.p95 / 1e6, p99: k2.p99 / 1e6, qps: k2.qps, mismatches: k2.mismatches,
    mb: Math.max(0.1, build.retainedBytes / 1024 / 1024), exact: k2.mismatches === 0, fast: k2.qps >= 250, light: false,
  };
});
// linear-scan keeps no index, so its 0.1 MB floor is not a real competitor on memory; it fails gate 2 anyway.
const base = rows.filter((r) => r.exact && r.fast);
const smallest = Math.min(...base.map((r) => r.mb));
for (const r of rows) r.light = r.mb <= 2 * smallest;
const passing = rows.filter((r) => r.exact && r.fast && r.light);
passing.sort((a, b) => {
  const tie = Math.abs(a.p95 - b.p95) / Math.min(a.p95, b.p95) <= 0.05;
  return tie ? a.p99 - b.p99 : a.p95 - b.p95;
});

const yn = (b: boolean) => (b ? "yes" : "NO");
const out: string[] = [];
out.push("# Fuzzy search decision\n");
out.push(`Computed from results/search.json (${data.env.date}). Words lexicon, N = ${words.n.toLocaleString("en-US")}, k = 2. The rule is documented at the top of src/decision-matrix.ts.\n`);
out.push(mdTable(
  ["Candidate", "p95 (ms)", "p99 (ms)", "Queries/s", "Retained (MB)", "Exact?", "Throughput gate (250/s)", `Memory gate (<= ${(2 * smallest).toFixed(1)} MB)`],
  rows.map((r) => [r.name, r.p95.toFixed(2), r.p99.toFixed(2), Math.round(r.qps).toLocaleString("en-US"), r.mb.toFixed(1), yn(r.exact), yn(r.fast), yn(r.light)]),
));
out.push("\n## Ranking among candidates passing every gate (lowest p95; within 5% is a tie, broken by p99)\n");
passing.forEach((r, i) => out.push(`${i + 1}. **${r.name}**: p95 ${r.p95.toFixed(2)} ms, p99 ${r.p99.toFixed(2)} ms, ${r.mb.toFixed(1)} MB`));
const fastestOverall = [...rows].filter((r) => r.exact && r.fast).sort((a, b) => a.p95 - b.p95)[0]!;
out.push(`\nFastest exact candidate ignoring memory: **${fastestOverall.name}** (p95 ${fastestOverall.p95.toFixed(2)} ms, ${fastestOverall.mb.toFixed(0)} MB), excluded by the memory gate if shown as NO above.\n`);
console.log(out.join("\n"));
writeResult("decision-matrix.md", out.join("\n"));
