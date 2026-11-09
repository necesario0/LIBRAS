// PostgreSQL candidates: fuzzy search (ILIKE, fuzzystrmatch scan, pg_trgm GIN) and hold dispatch
// (indexed ORDER BY priority LIMIT 1 with row locking).
//   npm run bench:pg          (needs the container from benchmarks/README.md)
//
// All timings are client round trips to a local Docker container, so they include loopback and
// Docker Desktop port-forwarding overhead, unlike the in-process benchmarks.
import pg from "pg";
import { generateLexicon, generateQueries } from "./data/catalog.ts";
import {
  environmentInfo, fmtInt, fmtMs, mdTable, nowNs, percentile, summarize, writeResult,
} from "./harness.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { churnScript, makeReservations } from "./heap/workloads.ts";
import { LinearScanIndex } from "./search/linear-scan.ts";

const QUICK = process.argv.includes("--quick");
const URL = process.env.BENCH_PG_URL ?? "postgres://postgres:bench@127.0.0.1:55432/libras_bench";
const N = QUICK ? 10_000 : 50_000;
const QUERIES = QUICK ? 100 : 400;
const K = 5_000;
const DISPATCH_OPS = QUICK ? 1_000 : 4_000;
const CONCURRENCY = 50;
const K_EDITS = 2;

function pool(options?: string, max = 1): pg.Pool {
  return new pg.Pool({ connectionString: URL, max, ...(options ? { options } : {}) });
}

// ------------------------------------------------------------------------------------ search
interface SqlCandidate {
  name: string;
  description: string;
  table: string;
  sql: string; // $1 = query, $2 = k
  init?: string; // libpq startup options, e.g. "-c pg_trgm.similarity_threshold=0.3"
}

const CANDIDATES: SqlCandidate[] = [
  {
    name: "pg-ilike-scan",
    description: "Milestone baseline 1: ILIKE '%term%' with no index (substring match, not edit distance)",
    table: "tokens_noidx",
    sql: "SELECT word FROM tokens_noidx WHERE word ILIKE '%' || $1::text || '%' AND $2::int IS NOT NULL",
  },
  {
    name: "pg-levenshtein-scan",
    description: "fuzzystrmatch levenshtein_less_equal over every row, with a length prefilter (exact, no index)",
    table: "tokens_noidx",
    sql: `SELECT word FROM tokens_noidx
          WHERE length(word) BETWEEN length($1::text) - $2::int AND length($1::text) + $2::int
            AND levenshtein_less_equal(word, $1::text, $2::int) <= $2::int`,
  },
  {
    name: "pg-trgm-gin-0.3",
    description: "pg_trgm GIN candidate filter (default similarity threshold 0.3) then exact levenshtein verify",
    table: "tokens",
    init: "-c pg_trgm.similarity_threshold=0.3",
    sql: `SELECT word FROM tokens WHERE word % $1::text AND levenshtein_less_equal(word, $1::text, $2::int) <= $2::int`,
  },
  {
    name: "pg-trgm-gin-0.1",
    description: "pg_trgm GIN candidate filter with a low threshold (0.1) for higher recall, then exact verify",
    table: "tokens",
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

async function benchSearch() {
  const lexicon = generateLexicon("words", N, 42);
  const queries = generateQueries(lexicon, { count: QUERIES, seed: 9, noMatchFraction: 0.05, minLen: 3, maxLen: 24 });
  const admin = pool();
  await loadTokens(admin, lexicon);
  const sizeRow = await admin.query(
    "SELECT pg_size_pretty(pg_relation_size('tokens')) AS tbl, pg_size_pretty(pg_relation_size('tokens_trgm')) AS idx, pg_relation_size('tokens_trgm') AS idx_bytes, pg_relation_size('tokens') AS tbl_bytes",
  );

  const truthIdx = new LinearScanIndex();
  truthIdx.build(lexicon);
  const truth = queries.map((q) => new Set(truthIdx.search(q.text, K_EDITS).map((m) => m.word)));
  const truthTotal = truth.reduce((s, t) => s + t.size, 0);

  const rows: (string | number)[][] = [];
  const raw: Record<string, unknown> = {};
  for (const c of CANDIDATES) {
    const single = pool(c.init, 1);
    // Check the plan actually uses the GIN index where it should.
    const plan = await single.query(`EXPLAIN ${c.sql}`, [queries[0]!.text, K_EDITS]);
    const planText = plan.rows.map((r) => r["QUERY PLAN"] as string).join("\n");
    const usesIndex = /Bitmap Index Scan|Index Scan/.test(planText);

    for (let i = 0; i < 20; i++) await single.query(c.sql, [queries[i % queries.length]!.text, K_EDITS]); // warm-up
    const ns: number[] = [];
    let found = 0, correct = 0, returned = 0;
    for (let i = 0; i < queries.length; i++) {
      const t0 = nowNs();
      const res = await single.query(c.sql, [queries[i]!.text, K_EDITS]);
      ns.push(nowNs() - t0);
      const words = res.rows.map((r) => r.word as string);
      returned += words.length;
      for (const w of words) if (truth[i]!.has(w)) correct++;
      found += truth[i]!.size ? words.filter((w) => truth[i]!.has(w)).length : 0;
    }
    await single.end();
    const s = summarize(ns);

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
    rows.push([
      c.name, usesIndex ? "yes" : "no", fmtMs(s.p50), fmtMs(s.p95), fmtMs(s.p99),
      `${(recall * 100).toFixed(1)}%`, `${(precision * 100).toFixed(1)}%`,
      fmtInt(queries.length / wall), fmtMs(sc.p95),
    ]);
    raw[c.name] = { description: c.description, usesIndex, seq: s, concurrent: sc, qps50: queries.length / wall, recall, precision };
    console.log(`  ${c.name}: p50 ${fmtMs(s.p50)} ms, recall ${(recall * 100).toFixed(1)}%`);
  }
  await admin.end();

  const md = [
    `### Fuzzy search in PostgreSQL 16, N = ${fmtInt(N)} tokens, k = ${K_EDITS}, ${queries.length} queries\n`,
    "Recall = share of the true within-2-edits words that the query returned; precision = share of returned words that are truly within 2 edits. Latency is the client round trip. The last two columns run all queries through 50 parallel connections.\n",
    mdTable(
      ["Candidate", "Uses index", "p50 (ms)", "p95 (ms)", "p99 (ms)", "Recall", "Precision", "Queries/s at 50 clients", "p95 at 50 clients (ms)"],
      rows,
    ),
    "",
    `Table size ${sizeRow.rows[0].tbl}, GIN trigram index size ${sizeRow.rows[0].idx}.`,
    "",
    ...CANDIDATES.map((c) => `- **${c.name}**: ${c.description}`),
    "",
  ].join("\n");
  return { md, raw, indexBytes: Number(sizeRow.rows[0].idx_bytes) };
}

// ------------------------------------------------------------------------------------ dispatch
async function benchDispatch() {
  const admin = pool();
  await admin.query("DROP TABLE IF EXISTS holds");
  await admin.query("CREATE TABLE holds (id bigint PRIMARY KEY, title int NOT NULL, score bigint NOT NULL, seq bigint NOT NULL)");
  await admin.query("CREATE INDEX holds_queue ON holds (title, score, seq)");

  const PUSH = "INSERT INTO holds (id, title, score, seq) VALUES ($1, 1, $2, $3)";
  const POP = `DELETE FROM holds WHERE id = (
                 SELECT id FROM holds WHERE title = 1 ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED
               ) RETURNING id`;
  const REMOVE = "DELETE FROM holds WHERE id = $1";

  async function preload(c: pg.Pool, items: ReturnType<typeof makeReservations>) {
    await c.query("TRUNCATE holds");
    for (let i = 0; i < items.length; i += 5000) {
      const chunk = items.slice(i, i + 5000);
      await c.query(
        "INSERT INTO holds (id, title, score, seq) SELECT * FROM unnest($1::bigint[], $2::int[], $3::bigint[], $4::bigint[])",
        [chunk.map((r) => r.id), chunk.map(() => 1), chunk.map((r) => r.score), chunk.map((r) => r.seq)],
      );
    }
    await c.query("ANALYZE holds");
  }

  // Correctness: serve order must equal the in-memory heap's order.
  const items = makeReservations(K, 11);
  const one = pool();
  await preload(one, items);
  const ref = new BinaryHeapDispatcher(true);
  for (const r of items) ref.push(r);
  let orderMatches = true;
  for (let i = 0; i < 500; i++) {
    const got = (await one.query(POP)).rows[0]?.id;
    if (Number(got) !== ref.popMin()?.id) { orderMatches = false; break; }
  }

  // Steady state: one return (pop) plus one new hold (push) per step, queue held near K.
  const pool2 = makeReservations(K + DISPATCH_OPS, 2);
  await preload(one, pool2.slice(0, K));
  const steadyNs: number[] = [];
  let next = K;
  for (let i = 0; i < 200; i++) { await one.query(POP); const r = pool2[next++]!; await one.query(PUSH, [r.id, r.score, r.seq]); }
  for (let i = 0; i < DISPATCH_OPS - 200 && next < pool2.length; i++) {
    const t0 = nowNs(); await one.query(POP); steadyNs.push(nowNs() - t0);
    const r = pool2[next++]!;
    const t1 = nowNs(); await one.query(PUSH, [r.id, r.score, r.seq]); steadyNs.push(nowNs() - t1);
  }
  const steady = summarize(steadyNs);

  // Churn with cancellations, same script as the in-memory benchmark.
  const script = churnScript(K, DISPATCH_OPS);
  await preload(one, script.preload);
  const churnNs: number[] = [];
  for (const op of script.ops) {
    const t0 = nowNs();
    if (op.kind === "push") await one.query(PUSH, [op.r!.id, op.r!.score, op.r!.seq]);
    else if (op.kind === "pop") await one.query(POP);
    else await one.query(REMOVE, [op.id!]);
    churnNs.push(nowNs() - t0);
  }
  const churn = summarize(churnNs);
  await one.end();

  // Concurrent returns: 50 desks pop from the same title at once. No hold may be served twice.
  const CONC_ITEMS = 2000;
  const many = pool(undefined, CONCURRENCY);
  await preload(many, makeReservations(CONC_ITEMS, 5));
  const served: number[] = [];
  const t0 = nowNs();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let i = 0; i < CONC_ITEMS / CONCURRENCY; i++) {
      const res = await many.query(POP);
      if (res.rows[0]) served.push(Number(res.rows[0].id));
    }
  }));
  const concWall = (nowNs() - t0) / 1e9;
  const distinct = new Set(served).size;
  await many.end();
  await admin.end();

  const md = [
    `### Hold dispatch in PostgreSQL 16, K = ${fmtInt(K)} holds for one title\n`,
    "Dispatch is an indexed `DELETE ... WHERE id = (SELECT ... ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED)`, which is atomic and transactional. Latencies are client round trips in milliseconds.\n",
    mdTable(
      ["Workload", "p50 (ms)", "p95 (ms)", "p99 (ms)"],
      [
        ["Steady state (pop and push, each timed)", fmtMs(steady.p50), fmtMs(steady.p95), fmtMs(steady.p99)],
        ["Churn with cancels (40% push, 40% pop, 20% cancel)", fmtMs(churn.p50), fmtMs(churn.p95), fmtMs(churn.p99)],
      ],
    ),
    "",
    `- Serve order for 500 consecutive pops matches the in-memory binary heap: **${orderMatches ? "yes" : "NO"}**.`,
    `- ${CONCURRENCY} concurrent clients drained ${fmtInt(CONC_ITEMS)} holds in ${concWall.toFixed(2)} s: ${fmtInt(served.length)} served, **${fmtInt(distinct)} distinct** (${served.length === distinct ? "no hold was served twice" : "DUPLICATE SERVES"}).`,
    "- With `SKIP LOCKED`, a client that finds the top hold locked takes the next one, so strict global priority order is not guaranteed under concurrency, but no hold is lost or served twice. Dropping `SKIP LOCKED` would serialise clients and keep strict order at the cost of waiting.",
    "",
  ].join("\n");
  return { md, raw: { steady, churn, orderMatches, concServed: served.length, concDistinct: distinct, concWall } };
}

const env = environmentInfo();
console.log(env);
console.log("search...");
const search = await benchSearch();
console.log("dispatch...");
const dispatch = await benchDispatch();
const suffix = QUICK ? "-quick" : "";
writeResult(`pg${suffix}.json`, { env, quick: QUICK, search: search.raw, dispatch: dispatch.raw });
writeResult(
  `pg${suffix}.md`,
  [
    `# PostgreSQL candidate results${QUICK ? " (quick run)" : ""}\n`,
    `Generated ${env.date} on ${env.cpus}, ${env.totalMemGB} GB RAM, Node ${env.node}. Database: PostgreSQL 16 in a local Docker container (Docker Desktop on Windows), default configuration. Round trips include Docker port-forwarding overhead, so absolute numbers are higher than a server on the same host as Node; relative ordering is the reliable part.\n`,
    search.md,
    dispatch.md,
  ].join("\n"),
);
void percentile;
console.log(`Wrote results/pg${suffix}.{json,md}`);
process.exit(0);
