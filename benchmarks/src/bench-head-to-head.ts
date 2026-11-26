// Focused comparison of the light-memory search candidates: the flattened trie (the shipped code and its
// benchmark prototype) and the bigram index.
//   npm run bench:h2h
// Repeats each measurement with a rotating candidate order so JIT warm-up and machine noise do not favour any
// candidate; figures are the median of the per-run percentiles with the IQR across runs.
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtTrialMs, gc, mdTable, measureRetained, nowNs, provenance, summarize, trialStat, writeResult,
} from "./harness.ts";
import { LibrasProductionIndex } from "./search/libras-production.ts";
import { NgramIndex } from "./search/ngram.ts";
import { TrieDpFlatIndex } from "./search/trie-dp-flat.ts";
import type { SearchIndex } from "./search/types.ts";

const QUICK = process.argv.includes("--quick");
const REPEATS = QUICK ? 2 : 5;
const QUERIES = QUICK ? 400 : 3000;
const SIZES = QUICK ? [10_000, 50_000] : [20_000, 50_000, 100_000, 200_000, 400_000];

type Make = () => SearchIndex;
const makers: Record<string, Make> = {
  "libras-flat-trie": () => new LibrasProductionIndex(),
  "trie-dp-flat": () => new TrieDpFlatIndex(),
  "ngram-bigram": () => new NgramIndex(),
};

function timeAll(idx: SearchIndex, qs: string[], k: number): number[] {
  for (let i = 0; i < 200; i++) idx.search(qs[i % qs.length]!, k);
  const ns: number[] = [];
  for (const q of qs) { const t0 = nowNs(); idx.search(q, k); ns.push(nowNs() - t0); }
  return ns;
}

const env = environmentInfo();
const out: string[] = ["# Head-to-head: flattened trie (shipped and prototype) vs bigram index\n"];
out.push(`${provenance(env)} Synthetic words lexicon; ${fmtInt(QUERIES)} queries per run, ${REPEATS} runs with a rotating candidate order; values are the median of per-run percentiles in ms, with the IQR across runs.\n`);

const raw: Record<string, unknown> = {};
const rows: (string | number)[][] = [];
const keys = Object.keys(makers);
for (const n of SIZES) {
  const lexicon = generateLexicon("words", n, 42);
  const qs = generateQueries(lexicon, { count: QUERIES, seed: 31, noMatchFraction: 0.05, minLen: 3, maxLen: 24 }).map((q) => q.text);
  const built: Record<string, SearchIndex> = {};
  const mem: Record<string, number> = {};
  for (const [name, make] of Object.entries(makers)) {
    const { value, bytes } = measureRetained(() => { const i = make(); i.build(lexicon); return i; });
    built[name] = value; mem[name] = bytes;
  }
  for (const k of [1, 2]) {
    const acc: Record<string, { p50: number[]; p95: number[]; p99: number[] }> = {};
    for (let rep = 0; rep < REPEATS; rep++) {
      const order = keys.map((_, i) => keys[(i + rep) % keys.length]!);
      if (rep % 2 === 1) order.reverse();
      for (const name of order) {
        gc();
        const s = summarize(timeAll(built[name]!, qs, k));
        const a = (acc[name] ??= { p50: [], p95: [], p99: [] });
        a.p50.push(s.p50); a.p95.push(s.p95); a.p99.push(s.p99);
      }
    }
    for (const name of keys) {
      const a = acc[name]!;
      const t50 = trialStat(a.p50), t95 = trialStat(a.p95), t99 = trialStat(a.p99);
      rows.push([fmtInt(n), k, name, fmtTrialMs(t50), fmtTrialMs(t95), fmtTrialMs(t99), (mem[name]! / 1024 / 1024).toFixed(1)]);
      raw[`${n}-k${k}-${name}`] = { p50: t50, p95: t95, p99: t99, retainedBytes: mem[name] };
    }
    console.log(`N=${fmtInt(n)} k=${k} done`);
  }
}
out.push(mdTable(["N (tokens)", "k", "Candidate", "p50 (ms)", "p95 (ms)", "p99 (ms)", "Retained (MB)"], rows));
out.push("");
const suffix = QUICK ? "-quick" : "";
writeResult(`head-to-head${suffix}.md`, out.join("\n"));
writeResult(`head-to-head${suffix}.json`, { env, raw });
console.log(out.join("\n"));
