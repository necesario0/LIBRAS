// Checks the quantitative claims made in the submitted milestone against measurements.
//   npm run bench:claims
// Each claim is quoted from "PBL Milestone 1: Algorithm Architecture Specification".
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import { environmentInfo, fmtInt, fmtMB, fmtMs, mdTable, measureRetained, summarize, nowNs, writeResult } from "./harness.ts";
import { makeReservation } from "./heap/types.ts";
import type { Reservation, Role } from "./heap/types.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { mulberry32, randInt } from "./prng.ts";
import { TrieDpFlatIndex } from "./search/trie-dp-flat.ts";
import { TrieDpIndex } from "./search/trie-dp.ts";

const QUICK = process.argv.includes("--quick");
const env = environmentInfo();
const out: string[] = [];
out.push(`# Verification of milestone claims${QUICK ? " (quick run)" : ""}\n`);
out.push(`Generated ${env.date} on ${env.cpus}, Node ${env.node}. Synthetic data - see the caveat in src/data/catalog.ts: character-distribution-dependent figures (pruning, branching) must be re-checked on the real catalog.\n`);

// ---------------------------------------------------------------- search claims
const N = QUICK ? 10_000 : 50_000;
const lexicon = generateLexicon("words", N, 42);
const avgLen = lexicon.reduce((s, w) => s + w.length, 0) / lexicon.length;

const trie = new TrieDpIndex();
const trieMem = measureRetained(() => { trie.build(lexicon); return trie; }).bytes;
const flat = new TrieDpFlatIndex();
const flatMem = measureRetained(() => { flat.build(lexicon); return flat; }).bytes;

let internal = 0, fanout = 0;
(function walk(node: (typeof trie)["root"]) {
  // iterative to avoid deep recursion issues
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.children.size) { internal++; fanout += n.children.size; }
    for (const c of n.children.values()) stack.push(c);
  }
})(trie.root);

function visitStats(index: TrieDpIndex, m: number, k: number, count: number) {
  const qs = generateQueries(lexicon, { count, seed: 21 + m, noMatchFraction: 0, minLen: m, maxLen: m, editChoices: k === 0 ? [0] : [1, 2] });
  let visited = 0;
  let matches = 0;
  for (const q of qs) { matches += index.search(q.text, k).length; visited += index.lastStats.nodesVisited; }
  return { visited: visited / qs.length, matches: matches / qs.length };
}

out.push("## Claim 1 - Trie memory\n");
out.push(`Milestone: "approximately 18.5 MB" for 50,000 titles x 4 tokens x 6 chars; node count "compressed to approximately 0.35 x (N x L_avg)".\n`);
out.push(mdTable(
  ["Measure", "Value"],
  [
    ["Lexicon", `${fmtInt(N)} unique synthetic tokens, mean length ${avgLen.toFixed(1)} chars`],
    ["Trie nodes", fmtInt(trie.nodeCount)],
    ["Nodes / (N x L_avg)", (trie.nodeCount / (N * avgLen)).toFixed(3) + " (claim: ~0.35)"],
    ["Mean fan-out of internal nodes", (fanout / internal).toFixed(2)],
    ["Retained memory, spec-faithful trie (Map children)", `${fmtMB(trieMem)} MB`],
    ["Retained memory, flattened typed-array trie (32-bit offsets)", `${fmtMB(flatMem)} MB`],
  ],
));

out.push("\n## Claim 2 - Pruning and node visits\n");
out.push(`Milestone: "branch-and-bound pruning eliminates 98.4% of candidate branches"; "~40 node visits" for m = 12 at k = 2; "b_eff ~ 1.84". The milestone does not define b_eff or "candidate branches", so the fraction of trie nodes never visited is reported (the most natural reading of the 98.4% figure).\n`);
const rows2: (string | number)[][] = [];
for (const m of [6, 12, 16]) {
  for (const k of [1, 2]) {
    const s = visitStats(trie, m, k, QUICK ? 100 : 300);
    rows2.push([m, k, s.visited.toFixed(0), ((1 - s.visited / trie.nodeCount) * 100).toFixed(2) + "%", s.matches.toFixed(1)]);
  }
}
out.push(mdTable(["Query length m", "k", "Nodes visited / query", "Trie nodes never visited", "Matches / query"], rows2));

out.push("\n## Claim 3 - Search cost is independent of catalog size\n");
out.push(`Milestone: worst-case time is "strictly independent of the database lexicon size N". The O(m^3 |Sigma|^2) bound is a ceiling that holds for any N, but real cost can still grow with N because more dictionary words fall inside the edit ball. Measured at m = 12, k = 2:\n`);
const sizes = QUICK ? [2_000, 10_000] : [5_000, 20_000, 50_000, 100_000, 200_000];
const rows3: (string | number)[][] = [];
for (const n of sizes) {
  const lex = generateLexicon("words", n, 42);
  const t = new TrieDpIndex();
  t.build(lex);
  const qs = generateQueries(lex, { count: 200, seed: 77, noMatchFraction: 0, minLen: 12, maxLen: 12, editChoices: [1, 2] });
  let visited = 0; const ns: number[] = [];
  for (const q of qs) { const t0 = nowNs(); t.search(q.text, 2); ns.push(nowNs() - t0); visited += t.lastStats.nodesVisited; }
  rows3.push([fmtInt(n), fmtInt(t.nodeCount), (visited / qs.length).toFixed(0), fmtMs(summarize(ns).p50)]);
}
out.push(mdTable(["N (tokens)", "Trie nodes", "Nodes visited / query", "p50 latency (ms)"], rows3));

out.push("\n## Claim 4 - Latency SLAs\n");
out.push(`Milestone: search within 1.0 s at 50 concurrent users (SRS); "well within the 35 ms SLA" (average case). Measured end-to-end of the algorithm only (no network or database), N = ${fmtInt(N)}, k = 2, single thread:\n`);
{
  const qs = generateQueries(lexicon, { count: QUICK ? 300 : 1500, seed: 13, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
  const rows: (string | number)[][] = [];
  for (const [label, idx] of [["trie-dp (spec-faithful)", trie], ["trie-dp-flat", flat]] as const) {
    for (let i = 0; i < 100; i++) idx.search(qs[i]!.text, 2);
    const ns: number[] = [];
    for (const q of qs) { const t0 = nowNs(); idx.search(q.text, 2); ns.push(nowNs() - t0); }
    const s = summarize(ns);
    rows.push([label, fmtMs(s.p50), fmtMs(s.p95), fmtMs(s.p99), fmtMs(s.max), fmtInt(qs.length / (ns.reduce((a, b) => a + b, 0) / 1e9))]);
  }
  out.push(mdTable(["Implementation", "p50 (ms)", "p95 (ms)", "p99 (ms)", "max (ms)", "queries/s"], rows));
  out.push("\nThe 250 queries/s peak load in the milestone is the throughput to compare against the last column.");
}

// ---------------------------------------------------------------- heap claims
out.push("\n## Claim 5 - Heap memory and insertion cost\n");
out.push(`Milestone: "For K = 5,000, memory footprint is under 400 KB"; "a random insertion into a binary heap sifts up only 1.6 levels" on average.\n`);
const K = 5_000;
{
  const { bytes } = measureRetained(() => {
    const d = new BinaryHeapDispatcher(false);
    const rng = mulberry32(8);
    let t = 1_700_000_000_000;
    for (let i = 0; i < K; i++) {
      t += randInt(rng, 1, 5000);
      d.push(makeReservation(i, t, "Student"));
    }
    return d;
  });
  // Instrumented sift-up count (arrival order = insertion order, as in the real system).
  function swapsPerInsert(roleOf: (rng: () => number) => Role, trials: number): number {
    let total = 0;
    for (let trial = 0; trial < trials; trial++) {
      const rng = mulberry32(100 + trial);
      const heap: Reservation[] = [];
      let t = 1_700_000_000_000;
      for (let i = 0; i < K; i++) {
        t += randInt(rng, 1, 5000);
        const r = makeReservation(i, t, roleOf(rng));
        heap.push(r);
        let j = heap.length - 1;
        while (j > 0) {
          const p = (j - 1) >> 1;
          if (!(r.score < heap[p]!.score)) break;
          heap[j] = heap[p]!; j = p; total++;
        }
        heap[j] = r;
      }
    }
    return total / (trials * K);
  }
  const mixed = (rng: () => number): Role => { const r = rng(); return r < 0.7 ? "Student" : r < 0.85 ? "Faculty" : r < 0.95 ? "NTP" : "Visitor"; };
  const uniformScore = (rng: () => number): Role => (["Faculty", "Student", "NTP", "Visitor"] as Role[])[Math.floor(rng() * 4)]!;
  out.push(mdTable(
    ["Measure", "Value"],
    [
      [`Heap + ${fmtInt(K)} reservation records, retained`, `${(bytes / 1024).toFixed(0)} KB (claim: < 400 KB)`],
      ["Mean sift-up swaps per insert, all Students (pure FIFO)", swapsPerInsert(() => "Student", 5).toFixed(3)],
      ["Mean sift-up swaps per insert, 70/15/10/5 role mix", swapsPerInsert(mixed, 5).toFixed(3) + " (claim: ~1.6)"],
      ["Mean sift-up swaps per insert, roles uniform over the four tiers", swapsPerInsert(uniformScore, 5).toFixed(3)],
    ],
  ));
  out.push("\nWith arrival times strictly increasing and a single role, no insert ever sifts up, because every new score is larger than all existing scores. Sift-up only happens when a higher-weight role arrives after lower-weight ones.");
}

out.push("");
console.log(out.join("\n"));
const suffix = QUICK ? "-quick" : "";
writeResult(`claims${suffix}.md`, out.join("\n"));
console.log(`Wrote results/claims${suffix}.md`);
