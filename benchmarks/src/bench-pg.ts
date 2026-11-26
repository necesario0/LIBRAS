// PostgreSQL candidates: fuzzy search (ILIKE, fuzzystrmatch scan, pg_trgm GIN) and hold dispatch with the
// schema and the dispatch statement LIBRAS ships (supabase/migrations/20261112200000_holds.sql,
// apps/api/src/holds/dispatch.ts).
//   npm run bench:pg          (set BENCH_PG_URL, or use the container from benchmarks/README.md)
//
// All timings are client round trips, so they include the connection between Node and the server. The
// environment (server version, host, client platform) is read at run time and written into the results.
import pg from "pg";
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import type { QueryCase } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtMs, mdTable, nowNs, provenance, summarize, trialStat, writeResult,
} from "./harness.ts";
import type { TrialStat } from "./harness.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { churnScript, makeReservations } from "./heap/workloads.ts";
import type { Reservation } from "./heap/types.ts";
import { LibrasProductionIndex } from "./search/libras-production.ts";
import { levenshtein } from "./search/levenshtein.ts";
import { LinearScanIndex } from "./search/linear-scan.ts";

const QUICK = process.argv.includes("--quick");
const URL = process.env.BENCH_PG_URL ?? "postgres://postgres:bench@127.0.0.1:55432/libras_bench";
const N = QUICK ? 10_000 : 50_000;
const QUERIES = QUICK ? 100 : 400;
const K_EDITS = 2;
const TRIALS = QUICK ? 2 : 5;
const DISPATCH_OPS = QUICK ? 1_000 : 4_000;
const QUEUE_SIZES = QUICK ? [5_000] : [5_000, 50_000];
const CONCURRENCY = 50;
const CONC_ITEMS = QUICK ? 500 : 2_000;
const BOOK = 1;

function pool(options?: string, max = 1): pg.Pool {
  return new pg.Pool({ connectionString: URL, max, ...(options ? { options } : {}) });
}

// ------------------------------------------------------------------------------------ environment
async function describeServer(): Promise<{ version: string; host: string; text: string }> {
  const c = pool();
  const version = (await c.query("SELECT version() AS v")).rows[0].v as string;
  const settings = (await c.query("SELECT current_setting('shared_buffers') AS sb, current_setting('max_connections') AS mc")).rows[0];
  await c.end();
  const u = new globalThis.URL(URL);
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname);
  const serverOnLinux = /linux/i.test(version);
  const where = !local
    ? "a remote host"
    : serverOnLinux && process.platform !== "linux"
      ? `this machine, inside a Linux container or VM reached through loopback port forwarding (the client runs on ${process.platform})`
      : "this machine, over loopback TCP";
  const text = `Server: ${version.split(",")[0]} at ${u.hostname}:${u.port || "5432"} on ${where}; shared_buffers ${settings.sb}, max_connections ${settings.mc}. Client: Node ${process.version} on ${process.platform} ${process.arch}.`;
  return { version, host: `${u.hostname}:${u.port || "5432"}`, text };
}

// ------------------------------------------------------------------------------------ search
interface SqlCandidate {
  name: string;
  description: string;
  sql: string; // $1 = query, $2 = k
  init?: string; // libpq startup options, e.g. "-c pg_trgm.similarity_threshold=0.3"
}

const CANDIDATES: SqlCandidate[] = [
  {
    name: "pg-ilike-scan",
    description: "Milestone baseline 1: ILIKE '%term%' with no index (substring match, not edit distance)",
    sql: "SELECT word FROM tokens_noidx WHERE word ILIKE '%' || $1::text || '%' AND $2::int IS NOT NULL",
  },
  {
    name: "pg-levenshtein-scan",
    description: "fuzzystrmatch levenshtein_less_equal over every row, with a length prefilter (exact, no index)",
    sql: `SELECT word FROM tokens_noidx
          WHERE length(word) BETWEEN length($1::text) - $2::int AND length($1::text) + $2::int
            AND levenshtein_less_equal(word, $1::text, $2::int) <= $2::int`,
  },
  {
    name: "pg-trgm-gin-0.3",
    description: "pg_trgm GIN candidate filter (default similarity threshold 0.3) then exact levenshtein verify",
    init: "-c pg_trgm.similarity_threshold=0.3",
    sql: `SELECT word FROM tokens WHERE word % $1::text AND levenshtein_less_equal(word, $1::text, $2::int) <= $2::int`,
  },
  {
    name: "pg-trgm-gin-0.1",
    description: "pg_trgm GIN candidate filter with a low threshold (0.1) for higher recall, then exact verify",
    init: "-c pg_trgm.similarity_threshold=0.1",
    sql: `SELECT word FROM tokens WHERE word % $1::text AND levenshtein_less_equal(word, $1::text, $2::int) <= $2::int`,
  },
];

async function loadTokens(admin: pg.Pool, lexicon: string[]) {
  await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await admin.query("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch");
  for (const t of ["tokens", "tokens_noidx"]) {
    await admin.query(`DROP TABLE IF EXISTS ${t}`);
    await admin.query(`CREATE TABLE ${t} (word text NOT NULL)`);
    for (let i = 0; i < lexicon.length; i += 10_000) {
      await admin.query(`INSERT INTO ${t} (word) SELECT unnest($1::text[])`, [lexicon.slice(i, i + 10_000)]);
    }
  }
  await admin.query("CREATE INDEX tokens_trgm ON tokens USING gin (word gin_trgm_ops)");
  await admin.query("ANALYZE tokens");
  await admin.query("ANALYZE tokens_noidx");
}

/** Which failure categories a query falls into: by the edits applied, by true distance, and by length. */
function categories(q: QueryCase): string[] {
  const out: string[] = [];
  if (q.ops.length === 0) out.push("no typo");
  else if (q.ops.length === 1) out.push(`one ${q.ops[0]}`);
  else out.push("two edit operations");
  const d = levenshtein(q.text, q.source!);
  out.push(d <= K_EDITS ? `Levenshtein distance ${d}` : `Levenshtein distance ${K_EDITS + 1}+ (beyond k)`);
  out.push(q.text.length <= 6 ? "short word (3-6 chars)" : q.text.length <= 12 ? "medium word (7-12 chars)" : "long word (13+ chars)");
  return out;
}

async function benchSearch() {
  const lexicon = generateLexicon("words", N, 42);
  const queries = generateQueries(lexicon, { count: QUERIES, seed: 9, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
  const admin = pool();
  await loadTokens(admin, lexicon);
  const sizeRow = await admin.query(
    "SELECT pg_size_pretty(pg_relation_size('tokens')) AS tbl, pg_size_pretty(pg_relation_size('tokens_trgm')) AS idx, pg_relation_size('tokens_trgm') AS idx_bytes",
  );

  const truthIdx = new LinearScanIndex();
  truthIdx.build(lexicon);
  const truth = queries.map((q) => new Set(truthIdx.search(q.text, K_EDITS).map((m) => m.word)));
  const truthTotal = truth.reduce((s, t) => s + t.size, 0);

  // The shipped trie answers the same queries in process, for the failure-mode comparison.
  const trie = new LibrasProductionIndex();
  trie.build(lexicon);
  const returnedBy: Record<string, Set<string>[]> = { "libras-flat-trie": queries.map((q) => new Set(trie.search(q.text, K_EDITS).map((m) => m.word))) };

  const rows: (string | number)[][] = [];
  const raw: Record<string, unknown> = {};
  for (const c of CANDIDATES) {
    const single = pool(c.init, 1);
    // Check the plan actually uses the GIN index where it should.
    const plan = await single.query(`EXPLAIN ${c.sql}`, [queries[0]!.text, K_EDITS]);
    const planText = plan.rows.map((r) => r["QUERY PLAN"] as string).join("\n");
    const usesIndex = /Bitmap Index Scan|Index Scan/.test(planText);

    for (let i = 0; i < 20; i++) await single.query(c.sql, [queries[i % queries.length]!.text, K_EDITS]); // warm-up
    // Correctness pass (also records what each query returned).
    let found = 0, correct = 0, returned = 0;
    const sets: Set<string>[] = [];
    for (let i = 0; i < queries.length; i++) {
      const words = (await single.query(c.sql, [queries[i]!.text, K_EDITS])).rows.map((r) => r.word as string);
      sets.push(new Set(words));
      returned += words.length;
      for (const w of words) if (truth[i]!.has(w)) correct++;
      found += words.filter((w) => truth[i]!.has(w)).length;
    }
    returnedBy[c.name] = sets;
    // Timed trials: the same queries in a fresh order each trial.
    const p50: number[] = [], p95: number[] = [], p99: number[] = [];
    for (let t = 0; t < TRIALS; t++) {
      const order = queries.map((_, i) => (i * 7919 + t * 104729) % queries.length);
      const ns: number[] = [];
      for (const i of order) {
        const t0 = nowNs();
        await single.query(c.sql, [queries[i]!.text, K_EDITS]);
        ns.push(nowNs() - t0);
      }
      const s = summarize(ns);
      p50.push(s.p50); p95.push(s.p95); p99.push(s.p99);
    }
    await single.end();

    // 50 concurrent clients over the same queries.
    const many = pool(c.init, CONCURRENCY);
    const lat: number[] = [];
    let cursor = 0;
    const tStart = nowNs();
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= queries.length) return;
        const t0 = nowNs();
        await many.query(c.sql, [queries[i]!.text, K_EDITS]);
        lat.push(nowNs() - t0);
      }
    }));
    const wall = (nowNs() - tStart) / 1e9;
    await many.end();
    const sc = summarize(lat);

    const recall = truthTotal ? found / truthTotal : 1;
    const precision = returned ? correct / returned : 1;
    const s = { p50: trialStat(p50), p95: trialStat(p95), p99: trialStat(p99) };
    rows.push([
      c.name, usesIndex ? "yes" : "no", fmtMs(s.p50.median), `${fmtMs(s.p95.median)} (IQR ${fmtMs(s.p95.iqr)})`, fmtMs(s.p99.median),
      `${(recall * 100).toFixed(1)}%`, `${(precision * 100).toFixed(1)}%`,
      fmtInt(queries.length / wall), fmtMs(sc.p95),
    ]);
    raw[c.name] = { description: c.description, usesIndex, seq: s, concurrent: sc, qps50: queries.length / wall, recall, precision };
    console.log(`  ${c.name}: p50 ${fmtMs(s.p50.median)} ms, recall ${(recall * 100).toFixed(1)}%`);
  }
  await admin.end();

  // ---- failure-mode breakdown: did each candidate return the word the typo was made from? ----
  const shown = ["libras-flat-trie", "pg-trgm-gin-0.3", "pg-trgm-gin-0.1", "pg-ilike-scan"];
  const cats = new Map<string, number[]>();
  queries.forEach((q, i) => { if (q.source) for (const cat of categories(q)) (cats.get(cat) ?? cats.set(cat, []).get(cat)!).push(i); });
  const order = ["no typo", "one substitution", "one deletion", "one insertion", "one transposition", "two edit operations",
    "Levenshtein distance 0", "Levenshtein distance 1", "Levenshtein distance 2", `Levenshtein distance ${K_EDITS + 1}+ (beyond k)`,
    "short word (3-6 chars)", "medium word (7-12 chars)", "long word (13+ chars)"];
  const missRate = (name: string, idx: number[]) => {
    const missed = idx.filter((i) => !returnedBy[name]![i]!.has(queries[i]!.source!)).length;
    return `${((missed / idx.length) * 100).toFixed(1)}%`;
  };
  const failureRows = order.filter((cat) => cats.has(cat)).map((cat) => [cat, cats.get(cat)!.length, ...shown.map((name) => missRate(name, cats.get(cat)!))]);
  const misses: (string | number)[][] = [];
  queries.forEach((q, i) => {
    if (!q.source || misses.length >= 10) return;
    if (!returnedBy["pg-trgm-gin-0.3"]![i]!.has(q.source)) {
      misses.push([`\`${q.text}\``, `\`${q.source}\``, q.ops.join(" + ") || "none", levenshtein(q.text, q.source), returnedBy["libras-flat-trie"]![i]!.has(q.source) ? "yes" : "NO", returnedBy["pg-trgm-gin-0.1"]![i]!.has(q.source) ? "yes" : "NO"]);
    }
  });

  const md = [
    `### Fuzzy search in PostgreSQL, N = ${fmtInt(N)} tokens, k = ${K_EDITS}, ${queries.length} queries\n`,
    `Recall = share of the true within-2-edits words that the query returned; precision = share of returned words that are truly within 2 edits. Latency is the client round trip, median across ${TRIALS} trials (IQR across trials for p95). The last two columns run all queries through 50 parallel connections.\n`,
    mdTable(
      ["Candidate", "Uses index", "p50 (ms)", "p95 (ms)", "p99 (ms)", "Recall", "Precision", "Queries/s at 50 clients", "p95 at 50 clients (ms)"],
      rows,
    ),
    "",
    `Table size ${sizeRow.rows[0].tbl}, GIN trigram index size ${sizeRow.rows[0].idx}.`,
    "",
    ...CANDIDATES.map((c) => `- **${c.name}**: ${c.description}`),
    "",
    "#### Failure-mode breakdown\n",
    "Share of queries for which the candidate did NOT return the word the typo was made from (the intended word; lower is better). Each query is counted three times: by the edit operations applied, by its true Levenshtein distance to the intended word, and by length. An exact k = 2 search must find every intended word at distance 0 to 2 and cannot find one at distance 3 or more. An adjacent transposition costs 2 in Levenshtein distance, so a transposition plus any other edit can land beyond k = 2.\n",
    mdTable(["Query category", "Queries", ...shown.map((n) => `${n} miss rate`)], failureRows),
    "\nExample queries that pg-trgm-gin-0.3 misses:\n",
    mdTable(["Query", "Intended word", "Edits applied", "Levenshtein distance", "Found by libras-flat-trie?", "Found by pg-trgm-gin-0.1?"], misses),
    "\nWhy: a trigram filter needs the query and the word to share enough three-letter groups. One edit in a word of length L destroys up to three of its L + 2 padded trigrams, so short words and edits near the middle drop below the similarity threshold even when the word is within k. An exact edit-distance search has no such filter; its only misses are words beyond k.",
    "",
  ].join("\n");
  raw.failureModes = { columns: shown, rows: failureRows, examples: misses };
  return { md, raw, indexBytes: Number(sizeRow.rows[0].idx_bytes) };
}

// ------------------------------------------------------------------------------------ dispatch
// The shipped schema, cut to the columns the queue uses: a partial B-Tree index over waiting Holds only.
const SCHEMA = `
  DROP TABLE IF EXISTS holds;
  CREATE TABLE holds (
    id bigint PRIMARY KEY,
    book_id int NOT NULL,
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'fulfilled', 'expired', 'cancelled')),
    score bigint NOT NULL,
    seq bigint NOT NULL,
    copy_id int
  );
  CREATE INDEX holds_queue_idx ON holds (book_id, score, seq) WHERE status = 'waiting';`;
const PUSH = "INSERT INTO holds (id, book_id, score, seq) VALUES ($1, 1, $2, $3)";
// The statement of apps/api/src/holds/dispatch.ts (DISPATCH_SQL) without its join to members for the email.
const DISPATCH = `
  UPDATE holds h SET status = 'ready', copy_id = $2
   WHERE h.id = (SELECT q.id FROM holds q
                  WHERE q.book_id = $1 AND q.status = 'waiting'
                  ORDER BY q.score, q.seq LIMIT 1
                    FOR UPDATE SKIP LOCKED)
  RETURNING h.id`;
// The strict alternative: one dispatcher per title at a time (transaction advisory lock), no SKIP LOCKED.
const DISPATCH_STRICT = `
  UPDATE holds h SET status = 'ready', copy_id = $2
   WHERE h.id = (SELECT q.id FROM holds q
                  WHERE q.book_id = $1 AND q.status = 'waiting'
                  ORDER BY q.score, q.seq LIMIT 1
                    FOR UPDATE)
  RETURNING h.id`;
const CANCEL = "UPDATE holds SET status = 'cancelled' WHERE id = $1 AND status = 'waiting'";

async function preload(c: pg.Pool | pg.PoolClient, items: Reservation[]) {
  await c.query("TRUNCATE holds");
  for (let i = 0; i < items.length; i += 5000) {
    const chunk = items.slice(i, i + 5000);
    await c.query(
      "INSERT INTO holds (id, book_id, score, seq) SELECT a, 1, b, c FROM unnest($1::bigint[], $2::bigint[], $3::bigint[]) AS t(a, b, c)",
      [chunk.map((r) => r.id), chunk.map((r) => r.score), chunk.map((r) => r.seq)],
    );
  }
  await c.query("VACUUM ANALYZE holds");
}

/** Kendall's tau-a between two rankings of the same items, and the fraction of discordant pairs. O(n^2). */
function kendall(a: readonly number[], b: readonly number[]) {
  let concordant = 0, discordant = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const s = Math.sign(a[i]! - a[j]!) * Math.sign(b[i]! - b[j]!);
      if (s > 0) concordant++; else if (s < 0) discordant++;
    }
  }
  const pairs = (a.length * (a.length - 1)) / 2;
  return { tau: pairs ? (concordant - discordant) / pairs : 1, discordantShare: pairs ? discordant / pairs : 0 };
}

interface ConcurrencyVariant {
  name: string;
  strict: boolean;
  /** Share of dispatch transactions that roll back after choosing a Hold (a return that failed). */
  rollbackShare: number;
  /** Clients that lock the current top waiting Hold for a while and then roll back (a cancel that failed). */
  lockers: number;
}

async function concurrentDispatch(v: ConcurrencyVariant) {
  const items = makeReservations(CONC_ITEMS, 5);
  const rank = new Map<number, number>();
  [...items].sort((x, y) => x.score - y.score || x.seq - y.seq).forEach((r, i) => rank.set(r.id, i));
  const admin = pool();
  await preload(admin, items);
  await admin.end();

  const dispatchers = CONCURRENCY - v.lockers;
  const many = pool(undefined, CONCURRENCY);
  const served: { id: number; at: number }[] = [];
  let attempts = 0;
  let rollbacks = 0;
  let done = false;
  const t0 = nowNs();
  const dispatcher = async () => {
    for (;;) {
      const i = attempts++;
      if (i >= CONC_ITEMS) return;
      const c = await many.connect();
      try {
        await c.query("BEGIN");
        if (v.strict) await c.query("SELECT pg_advisory_xact_lock($1)", [BOOK]);
        const res = await c.query(v.strict ? DISPATCH_STRICT : DISPATCH, [BOOK, i]);
        await c.query("SELECT pg_sleep(0.001)"); // the rest of a return transaction: Loan update, audit entries
        if (res.rows[0] && v.rollbackShare > 0 && (i * 2654435761) % 1000 < v.rollbackShare * 1000) {
          await c.query("ROLLBACK");
          rollbacks++;
        } else {
          await c.query("COMMIT");
          if (res.rows[0]) served.push({ id: Number(res.rows[0].id), at: nowNs() });
        }
      } finally {
        c.release();
      }
    }
  };
  const locker = async () => {
    while (!done) {
      const c = await many.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT id FROM holds WHERE book_id = $1 AND status = 'waiting' ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED", [BOOK]);
        await c.query("SELECT pg_sleep(0.005)");
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
    }
  };
  const lockerRuns = Array.from({ length: v.lockers }, locker);
  await Promise.all(Array.from({ length: dispatchers }, dispatcher));
  const wall = (nowNs() - t0) / 1e9;
  done = true;
  await Promise.all(lockerRuns);
  await many.end();

  served.sort((x, y) => x.at - y.at);
  const ids = served.map((s) => s.id);
  const distinct = new Set(ids).size;
  const ranks = ids.map((id) => rank.get(id)!);
  // Rank among the served Holds, by priority; compare with the position in commit order.
  const priorityPos = new Map([...ranks].sort((x, y) => x - y).map((r, i) => [r, i]));
  const displacement = ranks.map((r, pos) => Math.abs(pos - priorityPos.get(r)!));
  const { tau, discordantShare } = kendall(ranks.map((_, i) => i), ranks);
  // "Left behind": a Hold still waiting at the end while a lower-priority Hold was served.
  const servedSet = new Set(ranks);
  const leftBehind = ranks.length ? [...Array(Math.max(...ranks) + 1).keys()].filter((r) => !servedSet.has(r)).length : 0;
  return {
    name: v.name, served: ids.length, distinct, rollbacks, wall, throughput: ids.length / wall,
    tau, discordantShare, maxDisplacement: Math.max(0, ...displacement),
    meanDisplacement: displacement.reduce((s, x) => s + x, 0) / Math.max(1, displacement.length), leftBehind,
  };
}

async function benchDispatch() {
  const admin = pool();
  await admin.query(SCHEMA);
  await admin.end();
  const one = pool();

  // Correctness: serve order must equal the in-memory reference's order.
  const items = makeReservations(5_000, 11);
  await preload(one, items);
  const ref = new BinaryHeapDispatcher(true);
  for (const r of items) ref.push(r);
  let orderMatches = true;
  for (let i = 0; i < 500; i++) {
    const got = (await one.query(DISPATCH, [BOOK, i])).rows[0]?.id;
    if (Number(got) !== ref.popMin()?.id) { orderMatches = false; break; }
  }

  // Per-operation cost at each queue size, TRIALS trials of the churn script (40% push, 40% dispatch, 20% cancel).
  const perSize: Record<number, Record<"push" | "dispatch" | "cancel", { p50: TrialStat; p95: TrialStat }>> = {};
  for (const k of QUEUE_SIZES) {
    const script = churnScript(k, DISPATCH_OPS);
    const acc: Record<string, { p50: number[]; p95: number[] }> = {};
    for (let t = -1; t < TRIALS; t++) { // trial -1 is an untimed warm-up
      await preload(one, script.preload);
      const ns: Record<string, number[]> = { push: [], dispatch: [], cancel: [] };
      for (const op of script.ops) {
        const t1 = nowNs();
        if (op.kind === "push") await one.query(PUSH, [op.r!.id, op.r!.score, op.r!.seq]);
        else if (op.kind === "pop") await one.query(DISPATCH, [BOOK, 0]);
        else await one.query(CANCEL, [op.id!]);
        ns[op.kind === "pop" ? "dispatch" : op.kind === "push" ? "push" : "cancel"]!.push(nowNs() - t1);
      }
      if (t < 0) continue;
      for (const [kind, xs] of Object.entries(ns)) {
        const s = summarize(xs);
        const a = (acc[kind] ??= { p50: [], p95: [] });
        a.p50.push(s.p50); a.p95.push(s.p95);
      }
    }
    perSize[k] = Object.fromEntries(Object.entries(acc).map(([kind, a]) => [kind, { p50: trialStat(a.p50), p95: trialStat(a.p95) }])) as never;
    console.log(`  churn at K=${fmtInt(k)} done`);
  }
  await one.end();

  // Concurrency: 50 clients dispatch Copies of the same title at once.
  const variants: ConcurrencyVariant[] = [
    { name: "SKIP LOCKED (shipped)", strict: false, rollbackShare: 0, lockers: 0 },
    { name: "SKIP LOCKED, 10% of returns roll back", strict: false, rollbackShare: 0.1, lockers: 0 },
    { name: "SKIP LOCKED, 5 clients hold the top Hold then roll back", strict: false, rollbackShare: 0, lockers: 5 },
    { name: "per-title advisory lock (strict)", strict: true, rollbackShare: 0, lockers: 0 },
    { name: "per-title advisory lock, 10% roll back", strict: true, rollbackShare: 0.1, lockers: 0 },
    { name: "per-title advisory lock, 5 lock holders", strict: true, rollbackShare: 0, lockers: 5 },
  ];
  const conc = [];
  for (const v of variants) {
    conc.push(await concurrentDispatch(v));
    console.log(`  ${v.name} done`);
  }

  const cell = (x: { p50: TrialStat; p95: TrialStat } | undefined) => (x ? `${fmtMs(x.p50.median)} / ${fmtMs(x.p95.median)} (IQR ${fmtMs(x.p95.iqr)})` : "-");
  const md = [
    "### Hold dispatch in PostgreSQL with the shipped schema and statement\n",
    "Schema: `holds (id, book_id, status, score, seq, copy_id)` with the partial B-Tree index `holds_queue_idx (book_id, score, seq) WHERE status = 'waiting'` (supabase/migrations/20261112200000_holds.sql). Dispatch is the statement of apps/api/src/holds/dispatch.ts: `UPDATE ... WHERE id = (SELECT ... WHERE status = 'waiting' ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED)`. A cancel is `UPDATE ... SET status = 'cancelled'`, which takes the row out of the partial index: an O(log K) index delete, not a search of the queue.\n",
    `- Serve order for 500 consecutive dispatches matches the in-memory reference heap: **${orderMatches ? "yes" : "NO"}**.\n`,
    `Per-operation round trip, p50 / p95 in ms (median across ${TRIALS} trials, IQR of the p95 in brackets), churn script of ${fmtInt(DISPATCH_OPS)} operations (40% new Hold, 40% dispatch, 20% cancel):\n`,
    mdTable(
      ["Operation", ...QUEUE_SIZES.map((k) => `K = ${fmtInt(k)} waiting Holds`)],
      (["push", "dispatch", "cancel"] as const).map((kind) => [kind === "push" ? "place a Hold" : kind, ...QUEUE_SIZES.map((k) => cell(perSize[k]?.[kind]))]),
    ),
    "",
    `#### Priority order under concurrency (${CONCURRENCY} clients, ${fmtInt(CONC_ITEMS)} dispatch attempts on one title)\n`,
    "Each dispatch runs in its own transaction with 1 ms of further work before COMMIT, like a return. Order is the client-observed commit order. Kendall's tau compares commit order with priority order (1 = identical). Displacement = how many places a Hold's commit position is from its priority position among the served Holds. Left behind = Holds still waiting when the run stopped while a lower-priority Hold had been served; such a Hold is the top of the queue again, so the next dispatch serves it (a delay, not a loss).\n",
    mdTable(
      ["Variant", "Served", "Distinct", "Dispatches/s", "Kendall tau", "Discordant pairs", "Max displacement", "Mean displacement", "Left behind"],
      conc.map((r) => [r.name, fmtInt(r.served), fmtInt(r.distinct), fmtInt(r.throughput), r.tau.toFixed(4), `${(r.discordantShare * 100).toFixed(2)}%`, r.maxDisplacement, r.meanDisplacement.toFixed(1), r.leftBehind]),
    ),
    "",
    "Reading the table: with SKIP LOCKED, concurrent dispatchers on one title each take the best Hold nobody else has locked. With clean commits, Holds of nearly equal priority only commit in a slightly different order, because transactions that started together finish in a different order. A real priority inversion needs a transaction that locks the top Hold and then rolls back (a failed return, or a cancel that fails): while it holds the lock, other dispatchers pass that Hold over. No Hold is served twice in any variant. The per-title advisory lock serialises dispatch for a title and keeps strict order in every variant, at a much lower throughput. In LIBRAS, concurrent dispatch on one title only happens when several Copies of that title come back in the same instant, and the 50-client run is a stress bound far above that.",
    "",
  ].join("\n");
  return { md, raw: { orderMatches, perSize, concurrency: conc } };
}

const env = environmentInfo();
console.log(env);
const server = await describeServer();
console.log(server.text);
console.log("search...");
const search = await benchSearch();
console.log("dispatch...");
const dispatch = await benchDispatch();
const suffix = QUICK ? "-quick" : "";
writeResult(`pg${suffix}.json`, { env, server, quick: QUICK, search: search.raw, dispatch: dispatch.raw });
writeResult(
  `pg${suffix}.md`,
  [
    `# PostgreSQL candidate results${QUICK ? " (quick run)" : ""}\n`,
    provenance(env),
    `${server.text} Default configuration. Latencies are client round trips, so they include the connection; compare candidates with each other rather than with the in-process benchmarks.\n`,
    search.md,
    dispatch.md,
  ].join("\n"),
);
console.log(`Wrote results/pg${suffix}.{json,md}`);
process.exit(0);
