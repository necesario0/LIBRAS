// Fuzzy-search benchmark: the chosen Bounded Levenshtein Trie (shipped code and prototype) vs alternatives.
//   npm run bench:search
//
// Every latency figure is the MEDIAN ACROSS TRIALS of a per-trial percentile, with the interquartile range
// (IQR) across trials next to it. Each trial runs every candidate once, in a freshly shuffled candidate order
// and a freshly shuffled query order, so JIT warm-up, run order and machine drift do not favour any candidate.
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import type { LexiconKind, QueryCase } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtMB, fmtMs, fmtTrialMs, gc, mdTable, measureRetained, median, nowNs, provenance,
  shuffled, summarize, trialStat, writeResult,
} from "./harness.ts";
import type { TrialStat } from "./harness.ts";
import { mulberry32 } from "./prng.ts";
import { searchFactories, TEAM_CHOICE } from "./registry.ts";
import { sortMatches } from "./search/types.ts";
import type { Match, SearchIndex } from "./search/types.ts";

const QUICK = process.argv.includes("--quick");
const TRIALS = QUICK ? 2 : 5;
const N_MAIN = QUICK ? 10_000 : 50_000;
const QUERY_COUNT = QUICK ? 300 : 1500;
const SCALE_SIZES = QUICK ? [2_000, 10_000] : [5_000, 20_000, 50_000, 100_000, 200_000];
const SCALE_QUERIES = QUICK ? 100 : 300;
// Memory budget for any one index. SymSpell's delete table is the only candidate that can exceed it; it is
// skipped at a size only when its PROJECTED memory (bytes per token measured at the largest size it was built
// at, times N) is over budget, and the reason is written into the results.
const MEMORY_BUDGET_MB = 1024;

interface IndexRun {
  name: string;
  buildMs: number;
  retainedBytes: number;
  index: SearchIndex;
}

function buildOne(make: () => SearchIndex, lexicon: string[]): IndexRun {
  const idx = make();
  const { bytes } = measureRetained(() => { idx.build(lexicon); return idx; });
  // measureRetained includes forced GCs; time three clean builds of throwaway instances and keep the median.
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const tmp = make();
    gc();
    const t0 = nowNs();
    tmp.build(lexicon);
    times.push((nowNs() - t0) / 1e6);
  }
  return { name: idx.name, buildMs: median(times), retainedBytes: bytes, index: idx };
}

function lengthBucket(len: number): "short(3-6)" | "medium(7-12)" | "long(13+)" {
  return len <= 6 ? "short(3-6)" : len <= 12 ? "medium(7-12)" : "long(13+)";
}
const BUCKETS = ["short(3-6)", "medium(7-12)", "long(13+)"] as const;

interface Timed { ns: number[]; results: Match[][] }

/** Runs the queries in the given order. ns[i] and results[i] belong to queries[i], whatever the order they ran in. */
function runQueries(idx: SearchIndex, queries: QueryCase[], k: number, order: readonly number[]): Timed {
  for (let i = 0; i < Math.min(100, queries.length); i++) idx.search(queries[order[i]!]!.text, k); // warm-up (JIT)
  const ns: number[] = new Array(queries.length);
  const results: Match[][] = new Array(queries.length);
  for (const qi of order) {
    const t0 = nowNs();
    const r = idx.search(queries[qi]!.text, k);
    ns[qi] = nowNs() - t0;
    results[qi] = r;
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

interface KStats { p50: TrialStat; p95: TrialStat; p99: TrialStat; max: number; qps: TrialStat; mismatches: number; avgMatches: number }

function benchKind(kind: LexiconKind, n: number) {
  const lexicon = generateLexicon(kind, n, 42);
  const queries = generateQueries(lexicon, { count: QUERY_COUNT, seed: 9, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
  console.log(`\n=== ${kind}: N=${fmtInt(n)}, ${queries.length} queries, ${TRIALS} trials ===`);
  const runs = searchFactories.map((make) => buildOne(make, lexicon));
  const names = runs.map((r) => r.name);
  const byName = new Map(runs.map((r) => [r.name, r]));
  const identity = queries.map((_, i) => i);

  const perK: Record<number, Record<string, KStats>> = {};
  const byBucket: Record<string, Record<string, TrialStat>> = {};
  const rng = mulberry32(1000 + n);

  for (const k of [1, 2]) {
    // Correctness first, outside the timed trials: every candidate against the linear-scan reference.
    const reference = runQueries(byName.get("linear-scan")!.index, queries, k, identity).results;
    const avgMatches = reference.reduce((s, r) => s + r.length, 0) / reference.length;
    const mismatches: Record<string, number> = {};
    for (const run of runs) mismatches[run.name] = sameResults(runQueries(run.index, queries, k, identity).results, reference);

    const acc: Record<string, { p50: number[]; p95: number[]; p99: number[]; max: number[]; qps: number[] }> = {};
    const bucketAcc: Record<string, Record<string, number[]>> = {};
    for (let t = 0; t < TRIALS; t++) {
      const queryOrder = shuffled(identity, rng);
      for (const name of shuffled(names, rng)) {
        gc();
        const { ns } = runQueries(byName.get(name)!.index, queries, k, queryOrder);
        const s = summarize(ns);
        const a = (acc[name] ??= { p50: [], p95: [], p99: [], max: [], qps: [] });
        a.p50.push(s.p50); a.p95.push(s.p95); a.p99.push(s.p99); a.max.push(s.max);
        a.qps.push(queries.length / (ns.reduce((x, y) => x + y, 0) / 1e9));
        if (k === 2) {
          for (const bucket of BUCKETS) {
            const samples = ns.filter((_, i) => lengthBucket(queries[i]!.text.length) === bucket);
            if (samples.length) ((bucketAcc[bucket] ??= {})[name] ??= []).push(summarize(samples).p95);
          }
        }
      }
    }
    perK[k] = {};
    for (const name of names) {
      const a = acc[name]!;
      perK[k]![name] = {
        p50: trialStat(a.p50), p95: trialStat(a.p95), p99: trialStat(a.p99), max: median(a.max),
        qps: trialStat(a.qps), mismatches: mismatches[name]!, avgMatches,
      };
    }
    if (k === 2) for (const bucket of BUCKETS) for (const [name, xs] of Object.entries(bucketAcc[bucket] ?? {})) (byBucket[bucket] ??= {})[name] = trialStat(xs);
    console.log(`k=${k}: mean matches per query = ${avgMatches.toFixed(2)}`);
  }

  const lines: string[] = [];
  lines.push(`### ${kind} lexicon, N = ${fmtInt(n)} tokens, ${queries.length} queries (5% no-match, edits 0-2), ${TRIALS} trials\n`);
  lines.push("Build time (median of 3 builds) and retained memory (heap + typed arrays after GC):\n");
  lines.push(mdTable(
    ["Index", "Build (ms)", "Retained (MB)"],
    runs.map((r) => [mark(r.name), r.buildMs.toFixed(0), fmtMB(r.retainedBytes)]),
  ));
  for (const k of [1, 2]) {
    lines.push(`\nQuery latency, k = ${k}, in ms: median across ${TRIALS} trials of each trial's percentile, with the IQR across trials. Mismatches = queries whose result set differs from the linear-scan reference (checked on every query):\n`);
    lines.push(mdTable(
      ["Index", "p50", "p95", "p99", "max", "queries/s (1 thread)", "Mismatches"],
      runs.map((r) => {
        const s = perK[k]![r.name]!;
        return [mark(r.name), fmtTrialMs(s.p50), fmtTrialMs(s.p95), fmtTrialMs(s.p99), fmtMs(s.max), fmtInt(s.qps.median), s.mismatches];
      }),
    ));
  }
  lines.push(`\nk = 2 p95 latency (ms) by query length, median across ${TRIALS} trials:\n`);
  lines.push(mdTable(
    ["Index", ...BUCKETS],
    runs.map((r) => [mark(r.name), ...BUCKETS.map((b) => (byBucket[b]?.[r.name] ? fmtTrialMs(byBucket[b]![r.name]!) : "-"))]),
  ));
  console.log(lines.join("\n"));
  return {
    kind, n, queries: queries.length, trials: TRIALS,
    build: runs.map((r) => ({ name: r.name, buildMs: r.buildMs, retainedBytes: r.retainedBytes })),
    perK, byBucket, markdown: lines.join("\n"),
  };
}

function mark(name: string): string {
  return TEAM_CHOICE.has(name) ? `**${name}**` : name;
}

function benchScaling() {
  console.log(`\n=== scaling with lexicon size (k=2, words, ${TRIALS} trials) ===`);
  const p50: Record<string, Record<number, TrialStat>> = {};
  const p95: Record<string, Record<number, TrialStat>> = {};
  const memory: Record<string, Record<number, number>> = {};
  const skipped: Record<string, Record<number, string>> = {};
  const bytesPerToken: Record<string, number> = {};
  const rng = mulberry32(77);
  for (const n of SCALE_SIZES) {
    const lexicon = generateLexicon("words", n, 42);
    const queries = generateQueries(lexicon, { count: SCALE_QUERIES, seed: 5, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
    const runs: IndexRun[] = [];
    for (const make of searchFactories) {
      const name = make().name;
      const projectedMB = bytesPerToken[name] !== undefined ? (bytesPerToken[name]! * n) / 1024 / 1024 : 0;
      if (projectedMB > MEMORY_BUDGET_MB) {
        (skipped[name] ??= {})[n] = `projected ${fmtInt(projectedMB)} MB > ${fmtInt(MEMORY_BUDGET_MB)} MB budget`;
        console.log(`  ${name} skipped at N=${fmtInt(n)}: ${skipped[name]![n]}`);
        continue;
      }
      const run = buildOne(make, lexicon);
      bytesPerToken[name] = run.retainedBytes / n;
      (memory[name] ??= {})[n] = run.retainedBytes;
      runs.push(run);
    }
    const acc50: Record<string, number[]> = {};
    const acc95: Record<string, number[]> = {};
    for (let t = 0; t < TRIALS; t++) {
      const order = shuffled(queries.map((_, i) => i), rng);
      for (const run of shuffled(runs, rng)) {
        gc();
        const s = summarize(runQueries(run.index, queries, 2, order).ns);
        (acc50[run.name] ??= []).push(s.p50);
        (acc95[run.name] ??= []).push(s.p95);
      }
    }
    for (const run of runs) {
      (p50[run.name] ??= {})[n] = trialStat(acc50[run.name]!);
      (p95[run.name] ??= {})[n] = trialStat(acc95[run.name]!);
    }
    console.log(`  N=${fmtInt(n)} done`);
  }
  const names = searchFactories.map((f) => f().name);
  const cell = (table: Record<string, Record<number, TrialStat>>, name: string, n: number) =>
    table[name]?.[n] ? fmtTrialMs(table[name]![n]!) : "skipped";
  const md = [
    `p50 latency (ms, k = 2), median across ${TRIALS} trials with IQR:\n`,
    mdTable(["Index", ...SCALE_SIZES.map(fmtInt)], names.map((name) => [mark(name), ...SCALE_SIZES.map((n) => cell(p50, name, n))])),
    `\np95 latency (ms, k = 2), median across ${TRIALS} trials with IQR:\n`,
    mdTable(["Index", ...SCALE_SIZES.map(fmtInt)], names.map((name) => [mark(name), ...SCALE_SIZES.map((n) => cell(p95, name, n))])),
    "\nRetained memory (MB):\n",
    mdTable(["Index", ...SCALE_SIZES.map(fmtInt)], names.map((name) => [mark(name), ...SCALE_SIZES.map((n) => (memory[name]?.[n] !== undefined ? fmtMB(memory[name]![n]!) : "skipped"))])),
  ];
  const reasons = Object.entries(skipped).flatMap(([name, at]) => Object.entries(at).map(([n, why]) => `- ${name} at N = ${fmtInt(Number(n))}: ${why} (bytes per token measured at the largest size it was built at).`));
  if (reasons.length) md.push("\nSkipped:\n", ...reasons);
  console.log(md.join("\n"));
  return { sizes: SCALE_SIZES, trials: TRIALS, p50, p95, memory, skipped, markdown: md.join("\n") };
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
    provenance(env),
    `Data is synthetic (see src/data/catalog.ts). Single-threaded, in-memory. ${TRIALS} independent trials, each with a shuffled candidate order and a shuffled query order; figures are the median across trials with the interquartile range (IQR) across trials.`,
    "Bold = the chosen design: **libras-flat-trie** is the code LIBRAS ships (packages/shared/src/search/flat-trie.ts), **trie-dp-flat** its benchmark prototype. trie-dp is the same algorithm with Map-based nodes (the first milestone sketch).",
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
