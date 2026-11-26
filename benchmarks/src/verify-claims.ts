// Checks the quantitative claims of the revised Algorithm Design Document against measurements, and shows
// what was wrong with the first version's figures.
//   npm run bench:claims
//
// Node visits are a property of the algorithm, not of the implementation: the Map-based trie (trie-dp) counts
// them, and the flat trie LIBRAS ships visits exactly the same nodes (same trie, same pruning rule).
// Latencies use the shipped code (packages/shared/src/search) and are medians across TRIALS shuffled trials.
import { generateCatalog } from "../../apps/api/src/seed/catalog-generator.ts";
import { buildCatalogIndex, tokenize } from "../../packages/shared/src/search/catalog-index.ts";
import type { IndexedBook } from "../../packages/shared/src/search/catalog-index.ts";
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtMB, fmtTrialMs, gc, mdTable, measureRetained, provenance, shuffled, summarize,
  nowNs, trialStat, writeResult,
} from "./harness.ts";
import { makeReservation } from "./heap/types.ts";
import type { Reservation, Role } from "./heap/types.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { mulberry32, pick, randInt } from "./prng.ts";
import { LibrasProductionIndex } from "./search/libras-production.ts";
import { TrieDpIndex } from "./search/trie-dp.ts";
import type { SearchIndex } from "./search/types.ts";

const QUICK = process.argv.includes("--quick");
const TRIALS = QUICK ? 2 : 5;
const env = environmentInfo();
const out: string[] = [];
/** The tables of this file as data, written to results/claims.json for the design document. */
const facts: Record<string, unknown> = {};
out.push(`# Verification of the design document's claims${QUICK ? " (quick run)" : ""}\n`);
out.push(provenance(env));
out.push(`Synthetic data (src/data/catalog.ts and the sample catalog of apps/api/src/seed/catalog-generator.ts): figures that depend on the character distribution (pruning, branching) must be re-checked on the real UMak catalog. Latencies are medians across ${TRIALS} trials with shuffled query order, IQR in brackets.\n`);

function timeTrials(idx: SearchIndex, qs: string[], k: number, seed: number): { p50: ReturnType<typeof trialStat>; p95: ReturnType<typeof trialStat>; qps: number } {
  const rng = mulberry32(seed);
  for (let i = 0; i < Math.min(100, qs.length); i++) idx.search(qs[i]!, k);
  const p50: number[] = [], p95: number[] = [], qps: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    gc();
    const ns: number[] = [];
    for (const q of shuffled(qs, rng)) { const t0 = nowNs(); idx.search(q, k); ns.push(nowNs() - t0); }
    const s = summarize(ns);
    p50.push(s.p50); p95.push(s.p95); qps.push(qs.length / (ns.reduce((a, b) => a + b, 0) / 1e9));
  }
  return { p50: trialStat(p50), p95: trialStat(p95), qps: trialStat(qps).median };
}

// ---------------------------------------------------------------- search claims
const N = QUICK ? 10_000 : 50_000;
const lexicon = generateLexicon("words", N, 42);
const avgLen = lexicon.reduce((s, w) => s + w.length, 0) / lexicon.length;

const trie = new TrieDpIndex();
const trieMem = measureRetained(() => { trie.build(lexicon); return trie; }).bytes;
const shipped = new LibrasProductionIndex();
const shippedMem = measureRetained(() => { shipped.build(lexicon); return shipped; }).bytes;

let internal = 0, fanout = 0;
{
  const stack = [trie.root];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.children.size) { internal++; fanout += n.children.size; }
    for (const c of n.children.values()) stack.push(c);
  }
}

out.push("## Claim 1 - Trie memory\n");
out.push("First version: \"approximately 18.5 MB\" for 50,000 titles x 4 tokens x 6 characters, node count about 0.35 x (N x L_avg). Revised: the shipped flat trie (32-bit typed arrays) needs a few MB for 50,000 distinct tokens and grows in step with its node count (Claim 3 lists it up to 200,000 tokens); a pointer trie with Map children needs over ten times more.\n");
facts.memory = { tokens: N, meanLength: avgLen, trieNodes: trie.nodeCount, nodesPerLetter: trie.nodeCount / (N * avgLen), shippedBytes: shippedMem, mapTrieBytes: trieMem };
out.push(mdTable(
  ["Measure", "Value"],
  [
    ["Lexicon", `${fmtInt(N)} unique synthetic tokens, mean length ${avgLen.toFixed(1)} characters (first version assumed 6)`],
    ["Trie nodes", fmtInt(trie.nodeCount)],
    ["Nodes / (N x L_avg)", `${(trie.nodeCount / (N * avgLen)).toFixed(3)} (first version: ~0.35)`],
    ["Mean fan-out of internal nodes", (fanout / internal).toFixed(2)],
    ["Retained memory, shipped flat trie (libras-flat-trie)", `${fmtMB(shippedMem)} MB`],
    ["Retained memory, Map-based pointer trie (trie-dp)", `${fmtMB(trieMem)} MB (x${(trieMem / shippedMem).toFixed(1)})`],
  ],
));

out.push("\n## Claim 2 - Node visits and pruning\n");
out.push("First version: \"~40 node visits\" for m = 12 at k = 2 and \"98.4% of branches pruned\". Revised: a query visits thousands of nodes at k = 2 (the edit ball around every prefix of the query, Section 3.1), which is still a small fraction of the trie.\n");
const rows2: (string | number)[][] = [];
for (const m of [6, 12, 16]) {
  for (const k of [1, 2]) {
    const qs = generateQueries(lexicon, { count: QUICK ? 100 : 300, seed: 21 + m, noMatchFraction: 0, minLen: m, maxLen: m, editChoices: k === 0 ? [0] : [1, 2] });
    let visited = 0, pruned = 0, matches = 0;
    for (const q of qs) { matches += trie.search(q.text, k).length; visited += trie.lastStats.nodesVisited; pruned += trie.lastStats.nodesPruned; }
    rows2.push([m, k, fmtInt(visited / qs.length), fmtInt(pruned / qs.length), `${((1 - visited / qs.length / trie.nodeCount) * 100).toFixed(2)}%`, (matches / qs.length).toFixed(1)]);
  }
}
facts.nodeVisits = rows2;
out.push(mdTable(["Query length m", "k", "Nodes visited / query", "Of which pruned (row min > k)", "Trie nodes never visited", "Matches / query"], rows2));

out.push("\n## Claim 3 - Search cost grows with the catalog, below the worst-case ceiling\n");
out.push("First version: worst-case time \"strictly independent of the database lexicon size N\". Revised: the O(m^(k+1) |Sigma|^(k+1)) bound does not mention N and caps the work for any N, but below that cap the visited nodes grow with N, because a larger lexicon fills more of the edit ball. Measured at m = 12, k = 2 with the shipped code:\n");
const sizes = QUICK ? [2_000, 10_000] : [5_000, 20_000, 50_000, 100_000, 200_000];
const rows3: (string | number)[][] = [];
for (const n of sizes) {
  const lex = generateLexicon("words", n, 42);
  const t = new TrieDpIndex();
  t.build(lex);
  const s = new LibrasProductionIndex();
  const mem = measureRetained(() => { s.build(lex); return s; }).bytes;
  const qs = generateQueries(lex, { count: 200, seed: 77, noMatchFraction: 0, minLen: 12, maxLen: 12, editChoices: [1, 2] });
  let visited = 0;
  for (const q of qs) { t.search(q.text, 2); visited += t.lastStats.nodesVisited; }
  const timed = timeTrials(s, qs.map((q) => q.text), 2, n);
  rows3.push([fmtInt(n), fmtInt(t.nodeCount), fmtInt(visited / qs.length), fmtTrialMs(timed.p50), fmtTrialMs(timed.p95), fmtMB(mem)]);
}
facts.growthWithN = rows3;
out.push(mdTable(["N (tokens)", "Trie nodes", "Nodes visited / query", "p50 (ms)", "p95 (ms)", "Shipped trie memory (MB)"], rows3));

out.push("\n## Claim 4 - Latency and throughput at the target scale\n");
out.push("Requirement: answer within 1.0 s at 50 concurrent users and sustain 250 queries/s (SRS). Algorithm only (no network or database), single thread, shipped code, k = 2, mixed query lengths:\n");
{
  const rows: (string | number)[][] = [];
  for (const n of QUICK ? [N] : [50_000, 200_000]) {
    const lex = n === N ? lexicon : generateLexicon("words", n, 42);
    const idx = n === N ? shipped : (() => { const s = new LibrasProductionIndex(); s.build(lex); return s; })();
    const qs = generateQueries(lex, { count: QUICK ? 300 : 1500, seed: 13, noMatchFraction: 0.05, minLen: 3, maxLen: 24 }).map((q) => q.text);
    const t = timeTrials(idx, qs, 2, 13 + n);
    rows.push([`${fmtInt(n)} tokens${n === 200_000 ? " (50,000 titles x 4 distinct tokens)" : ""}`, fmtTrialMs(t.p50), fmtTrialMs(t.p95), fmtInt(t.qps)]);
  }
  facts.latency = rows;
  out.push(mdTable(["Lexicon", "p50 (ms)", "p95 (ms)", "queries/s (1 thread)"], rows));
}

// ---------------------------------------------------------------- end-to-end catalog search, shipped policy
out.push("\n## Claim 5 - The shipped catalog search, end to end\n");
out.push("The API answers a catalog query with `buildCatalogIndex(...).search(query)` (packages/shared/src/search/catalog-index.ts): every query word must match a word of the Book within its typo bound (0 typos for words of 1 to 3 letters, 1 for 4 to 6, 2 for 7 or more; words with a digit match exactly), and the Books are ranked by the summed distance. Here it runs over the sample catalog the seed script loads (apps/api/src/seed/catalog-generator.ts). Each query takes 1 to 3 words of a random Book's title or author surname and applies one typo of the given kind to one word of 4 or more letters. Recall = share of queries whose intended Book is among the hits.\n");
{
  const catalog = generateCatalog(QUICK ? { searchTokens: 10_000 } : {});
  const books: IndexedBook[] = catalog.books.map((b, i) => ({ id: String(i), title: b.title, authors: b.authors, isbn: b.isbn, callNumber: b.lcCallNumber, accessionNumbers: b.copies.map((c) => c.accessionNumber) }));
  const { value: index, bytes: mem } = measureRetained(() => buildCatalogIndex(books));
  const builds: number[] = [];
  for (let i = 0; i < 3; i++) {
    gc();
    const t0 = nowNs();
    buildCatalogIndex(books);
    builds.push((nowNs() - t0) / 1e6);
  }
  const buildMs = trialStat(builds).median;
  facts.catalog = { books: books.length, tokens: index.tokenCount, copies: books.reduce((s, b) => s + (b.accessionNumbers?.length ?? 0), 0), buildMs, retainedBytes: mem };
  out.push(`Sample catalog: ${fmtInt(books.length)} Books, ${fmtInt(index.tokenCount)} distinct title and author words, ${fmtInt(books.reduce((s, b) => s + (b.accessionNumbers?.length ?? 0), 0))} Copies. Index build ${buildMs.toFixed(0)} ms, retained ${fmtMB(mem)} MB.\n`);

  const rng = mulberry32(4242);
  const letters = "abcdefghijklmnopqrstuvwxyz";
  type Kind = "none" | "substitution" | "deletion" | "insertion" | "transposition";
  const typo = (w: string, kind: Kind): string => {
    const i = randInt(rng, 0, w.length - 2);
    if (kind === "substitution") { let c = pick(rng, [...letters]); while (c === w[i]) c = pick(rng, [...letters]); return w.slice(0, i) + c + w.slice(i + 1); }
    if (kind === "deletion") return w.slice(0, i) + w.slice(i + 1);
    if (kind === "insertion") return w.slice(0, i) + pick(rng, [...letters]) + w.slice(i);
    if (kind === "transposition") return w[i] === w[i + 1] ? w.slice(0, i) + (w[i] === "a" ? "b" : "a") + w.slice(i + 1) : w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    return w;
  };
  const kinds: Kind[] = ["none", "substitution", "deletion", "insertion", "transposition"];
  const perQuery = QUICK ? 100 : 400;
  const rows: (string | number)[][] = [];
  const allQueries: string[] = [];
  for (const kind of kinds) {
    const byLen: Record<string, { n: number; hit: number }> = {};
    let n = 0, hit = 0, top20 = 0;
    while (n < perQuery) {
      const bi = randInt(rng, 0, books.length - 1);
      const book = books[bi]!;
      const words = [...new Set([...tokenize(book.title), tokenize(book.authors[0] ?? "")[0] ?? ""])].filter((w) => w && !/\d/.test(w));
      const long = words.filter((w) => w.length >= 4);
      if (long.length === 0) continue;
      const target = pick(rng, long);
      const others = shuffled(words.filter((w) => w !== target), rng).slice(0, randInt(rng, 0, 2));
      const query = [typo(target, kind), ...others].join(" ");
      const res = index.search(query);
      const found = res.hits.some((h) => h.bookId === book.id);
      const inTop = res.hits.slice(0, 20).some((h) => h.bookId === book.id);
      const bucket = target.length <= 6 ? "4-6 letters (1 typo allowed)" : "7+ letters (2 typos allowed)";
      const b = (byLen[bucket] ??= { n: 0, hit: 0 });
      b.n++; if (found) b.hit++;
      n++; if (found) hit++; if (inTop) top20++;
      allQueries.push(query);
    }
    const pct = (x: { n: number; hit: number } | undefined) => (x ? `${((x.hit / x.n) * 100).toFixed(1)}% of ${x.n}` : "-");
    rows.push([kind === "none" ? "no typo" : `one ${kind}`, `${((hit / n) * 100).toFixed(1)}%`, `${((top20 / n) * 100).toFixed(1)}%`, pct(byLen["4-6 letters (1 typo allowed)"]), pct(byLen["7+ letters (2 typos allowed)"])]);
  }
  facts.endToEnd = rows;
  out.push(mdTable(["Typo in one word", "Recall (any rank)", "Intended Book in first 20 hits", "Typo word of 4-6 letters", "Typo word of 7+ letters"], rows));
  // Latency of the whole catalog search (all query words, posting-list intersection, ranking).
  const rngT = mulberry32(99);
  for (let i = 0; i < 100; i++) index.search(allQueries[i]!);
  const p50: number[] = [], p95: number[] = [], qps: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    gc();
    const ns: number[] = [];
    for (const q of shuffled(allQueries, rngT)) { const s0 = nowNs(); index.search(q, { limit: 20 }); ns.push(nowNs() - s0); }
    const s = summarize(ns);
    p50.push(s.p50); p95.push(s.p95); qps.push(ns.length / (ns.reduce((a, b) => a + b, 0) / 1e9));
  }
  facts.endToEndLatency = { queries: allQueries.length, p50: trialStat(p50), p95: trialStat(p95), qps: trialStat(qps).median };
  out.push(`\nWhole catalog search over these ${fmtInt(allQueries.length)} queries: p50 ${fmtTrialMs(trialStat(p50))} ms, p95 ${fmtTrialMs(trialStat(p95))} ms, ${fmtInt(trialStat(qps).median)} queries/s on one thread.`);
  out.push("\nTwo gaps of the shipped policy show here, and both come from the typo bound, not from the trie. (1) The distance is plain Levenshtein, in which swapping two adjacent letters costs 2: a word of 4 to 6 letters may carry only 1 typo, so a transposition in such a word is not found, and in a longer word it uses the whole budget of 2. (2) The bound is chosen from the length of the word as typed: deleting a letter from a 4-letter word leaves 3 letters, which must match exactly. The planned remedies are optimal string alignment distance (a transposition costs 1) and a bound taken from the longer of the typed word and the candidate word (design document, Section 6.2). The first-20 column is lower than recall because a one-word query on a common word matches many Books at the same distance, which keep catalog order.");
}

// ---------------------------------------------------------------- heap claims
out.push("\n## Claim 6 - Dispatcher memory and insertion cost\n");
out.push("First version: \"For K = 5,000, memory footprint is under 400 KB\"; \"a random insertion sifts up only 1.6 levels\". Revised: arrival times only increase, so an insert sifts up only when a higher-weight role arrives after lower-weight ones; the mean is well under one level.\n");
const K = 5_000;
{
  const { bytes } = measureRetained(() => {
    const d = new BinaryHeapDispatcher(true);
    const rng = mulberry32(8);
    let t = 1_700_000_000_000;
    for (let i = 0; i < K; i++) {
      t += randInt(rng, 1, 5000);
      d.push(makeReservation(i, t, "Student"));
    }
    return d;
  });
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
  const uniform = (rng: () => number): Role => (["Faculty", "Student", "NTP", "Visitor"] as Role[])[Math.floor(rng() * 4)]!;
  facts.heap = { retainedBytes: bytes, swapsFifo: swapsPerInsert(() => "Student", 5), swapsMixed: swapsPerInsert(mixed, 5), swapsUniform: swapsPerInsert(uniform, 5) };
  out.push(mdTable(
    ["Measure", "Value"],
    [
      [`Indexed heap + ${fmtInt(K)} reservation records, retained`, `${(bytes / 1024).toFixed(0)} KB (first version: < 400 KB)`],
      ["Mean sift-up swaps per insert, all Students (pure FIFO)", swapsPerInsert(() => "Student", 5).toFixed(3)],
      ["Mean sift-up swaps per insert, 70/15/10/5 role mix", `${swapsPerInsert(mixed, 5).toFixed(3)} (first version: ~1.6)`],
      ["Mean sift-up swaps per insert, roles uniform over the four tiers", swapsPerInsert(uniform, 5).toFixed(3)],
    ],
  ));
}

out.push("");
console.log(out.join("\n"));
const suffix = QUICK ? "-quick" : "";
writeResult(`claims${suffix}.md`, out.join("\n"));
writeResult(`claims${suffix}.json`, { env, facts });
console.log(`Wrote results/claims${suffix}.md`);
