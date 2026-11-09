// Fuzzy-search benchmark: team's Bounded Trie Levenshtein vs alternatives.
//   npm run bench:search
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import type { LexiconKind, QueryCase } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtMB, fmtMs, gc, mdTable, measureRetained, nowNs, summarize, writeResult,
} from "./harness.ts";
import { searchFactories, TEAM_CHOICE } from "./registry.ts";
import { sortMatches } from "./search/types.ts";
import type { Match, SearchIndex } from "./search/types.ts";

const QUICK = process.argv.includes("--quick");
const N_MAIN = QUICK ? 10_000 : 50_000;
const QUERY_COUNT = QUICK ? 300 : 1500;
const SCALE_SIZES = QUICK ? [2_000, 10_000] : [5_000, 20_000, 50_000, 100_000, 200_000];
const SCALE_QUERIES = QUICK ? 100 : 300;
// SymSpell's delete table grows roughly 35x the lexicon; skip it past this size to stay within memory.
const SYMSPELL_MAX_N = 100_000;

interface IndexRun {
  name: string;
  buildMs: number;
  retainedBytes: number;
  index: SearchIndex;
}

function buildAll(lexicon: string[], skip: (name: string) => boolean = () => false): IndexRun[] {
  const runs: IndexRun[] = [];
  for (const make of searchFactories) {
    const probe = make();
    if (skip(probe.name)) continue;
    const idx = make();
    const { bytes } = measureRetained(() => { idx.build(lexicon); return idx; });
    // measureRetained includes two forced GCs; re-time a clean build for the build-time figure.
    const idx2 = make();
    gc();
    const t1 = nowNs();
    idx2.build(lexicon);
    const buildMs = (nowNs() - t1) / 1e6;
    runs.push({ name: idx.name, buildMs, retainedBytes: bytes, index: idx });
  }
  return runs;
}

function lengthBucket(len: number): "short(3-6)" | "medium(7-12)" | "long(13+)" {
  return len <= 6 ? "short(3-6)" : len <= 12 ? "medium(7-12)" : "long(13+)";
}

interface Timed { ns: number[]; results: Match[][] }

function runQueries(idx: SearchIndex, queries: QueryCase[], k: number): Timed {
  for (let i = 0; i < Math.min(100, queries.length); i++) idx.search(queries[i]!.text, k); // warm-up (JIT)
  const ns: number[] = [];
  const results: Match[][] = [];
  for (const q of queries) {
    const t0 = nowNs();
    const r = idx.search(q.text, k);
    ns.push(nowNs() - t0);
    results.push(r);
  }
  return { ns, results };
}

function sameResults(a: Match[][], b: Match[][]): number {
  let mismatches = 0;
  for (let i = 0; i < a.length; i++) {
    const x = sortMatches([...a[i]!]);
    const y = sortMatches([...b[i]!]);
    if (x.length !== y.length || x.some((m, j) => m.word !== y[j]!.word || m.dist !== y[j]!.dist)) mismatches++;
  }
  return mismatches;
}

function benchKind(kind: LexiconKind, n: number) {
  const lexicon = generateLexicon(kind, n, 42);
  const queries = generateQueries(lexicon, { count: QUERY_COUNT, seed: 9, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
  console.log(`\n=== ${kind}: N=${fmtInt(n)}, ${queries.length} queries ===`);
  const runs = buildAll(lexicon);

  const reference = runs.find((r) => r.name === "linear-scan")!;
  const perK: Record<number, Record<string, ReturnType<typeof summarize> & { qps: number; mismatches: number; avgMatches: number }>> = {};
  const byBucket: Record<string, Record<string, ReturnType<typeof summarize>>> = {};

  for (const k of [1, 2]) {
    perK[k] = {};
    const refRun = runQueries(reference.index, queries, k);
    const avgMatches = refRun.results.reduce((s, r) => s + r.length, 0) / refRun.results.length;
    for (const run of runs) {
      const timed = run.name === reference.name ? refRun : runQueries(run.index, queries, k);
      const s = summarize(timed.ns);
      const total = timed.ns.reduce((a, b) => a + b, 0);
      perK[k]![run.name] = {
        ...s,
        qps: queries.length / (total / 1e9),
        mismatches: run.name === reference.name ? 0 : sameResults(timed.results, refRun.results),
        avgMatches,
      };
      if (k === 2) {
        for (const bucket of ["short(3-6)", "medium(7-12)", "long(13+)"]) {
          const samples = timed.ns.filter((_, i) => lengthBucket(queries[i]!.text.length) === bucket);
          if (samples.length) (byBucket[bucket] ??= {})[run.name] = summarize(samples);
        }
      }
    }
    console.log(`k=${k}: mean matches per query = ${avgMatches.toFixed(2)}`);
  }

  const lines: string[] = [];
  lines.push(`### ${kind} lexicon, N = ${fmtInt(n)} tokens, ${queries.length} queries (5% no-match, edits 0-2)\n`);
  lines.push("Build time and retained memory (heap + typed arrays after GC):\n");
  lines.push(mdTable(
    ["Index", "Build (ms)", "Retained (MB)"],
    runs.map((r) => [mark(r.name), r.buildMs.toFixed(0), fmtMB(r.retainedBytes)]),
  ));
  for (const k of [1, 2]) {
    lines.push(`\nQuery latency, k = ${k} (ms; lower is better). Mismatches = queries whose result set differs from the linear-scan reference:\n`);
    lines.push(mdTable(
      ["Index", "p50", "p95", "p99", "max", "queries/s (1 thread)", "Mismatches"],
      runs.map((r) => {
        const s = perK[k]![r.name]!;
        return [mark(r.name), fmtMs(s.p50), fmtMs(s.p95), fmtMs(s.p99), fmtMs(s.max), fmtInt(s.qps), s.mismatches];
      }),
    ));
  }
  lines.push("\nk = 2 p95 latency (ms) by query length:\n");
  const buckets = Object.keys(byBucket);
  lines.push(mdTable(
    ["Index", ...buckets],
    runs.map((r) => [mark(r.name), ...buckets.map((b) => (byBucket[b]![r.name] ? fmtMs(byBucket[b]![r.name]!.p95) : "-"))]),
  ));
  console.log(lines.join("\n"));
  return {
    kind, n, queries: queries.length,
    build: runs.map((r) => ({ name: r.name, buildMs: r.buildMs, retainedBytes: r.retainedBytes })),
    perK, byBucket, markdown: lines.join("\n"),
  };
}

function mark(name: string): string {
  return TEAM_CHOICE.has(name) ? `**${name}**` : name;
}

function benchScaling() {
  console.log("\n=== scaling with lexicon size (k=2, words) ===");
  const rows: Record<string, Record<number, number>> = {};
  for (const n of SCALE_SIZES) {
    const lexicon = generateLexicon("words", n, 42);
    const queries = generateQueries(lexicon, { count: SCALE_QUERIES, seed: 5, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
    const runs = buildAll(lexicon, (name) => name === "symspell" && n > SYMSPELL_MAX_N);
    for (const run of runs) {
      const { ns } = runQueries(run.index, queries, 2);
      (rows[run.name] ??= {})[n] = summarize(ns).p50;
    }
    console.log(`  N=${fmtInt(n)} done`);
  }
  const names = Object.keys(rows);
  const md = mdTable(
    ["Index (p50 ms, k=2)", ...SCALE_SIZES.map(fmtInt)],
    names.map((name) => [mark(name), ...SCALE_SIZES.map((n) => (rows[name]![n] !== undefined ? fmtMs(rows[name]![n]!) : "skipped"))]),
  );
  console.log(md);
  return { sizes: SCALE_SIZES, p50ns: rows, markdown: md };
}

const env = environmentInfo();
console.log(env);
const words = benchKind("words", N_MAIN);
const callnos = benchKind("callnos", QUICK ? 5_000 : 20_000);
const scaling = benchScaling();

const out = { env, quick: QUICK, words, callnos, scaling };
const suffix = QUICK ? "-quick" : "";
writeResult(`search${suffix}.json`, out);
writeResult(
  `search${suffix}.md`,
  [
    `# Fuzzy search benchmark results${QUICK ? " (quick run)" : ""}`,
    "",
    `Generated ${env.date} on ${env.cpus}, ${env.totalMemGB} GB RAM, Node ${env.node}, ${env.platform}.`,
    "Data is synthetic (see src/data/catalog.ts). Single-threaded, in-memory. Bold = the team's chosen design.",
    "",
    words.markdown,
    "",
    callnos.markdown,
    "",
    "### Scaling with lexicon size\n",
    scaling.markdown,
    "",
  ].join("\n"),
);
console.log(`\nWrote results/search${suffix}.{json,md}`);
