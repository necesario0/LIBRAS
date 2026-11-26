// Reservation dispatcher benchmark: in-memory priority queues under the role-weighted score.
//   npm run bench:heap
//
// LIBRAS ships the dispatcher as a PostgreSQL queue (bench-pg.ts). The in-memory queues here are the reference
// model of that queue and the comparison of data structures. Each of REPS trials runs every structure once on
// every workload, in a freshly shuffled order; figures are the median across trials with the IQR across trials.
import {
  environmentInfo, fmtInt, gc, mdTable, measureRetained, nowNs, percentile, provenance, shuffled, trialStat, writeResult,
} from "./harness.ts";
import type { TrialStat } from "./harness.ts";
import { mulberry32 } from "./prng.ts";
import { dispatcherFactories, TEAM_CHOICE } from "./registry.ts";
import { churnScript, makeReservations } from "./heap/workloads.ts";
import type { Op } from "./heap/workloads.ts";
import type { Dispatcher, Reservation } from "./heap/types.ts";

const QUICK = process.argv.includes("--quick");
const SIZES = QUICK ? [100, 1_000, 5_000] : [100, 1_000, 5_000, 50_000];
const REPS = QUICK ? 3 : 7;
const CHURN_OPS = QUICK ? 20_000 : 100_000;
const BATCH = 500; // ops per timed batch for the p99 estimate (timer overhead is too large for single ops)
// Skip combinations that are quadratic and would take minutes; they are reported as "skipped".
const TOO_SLOW = (name: string, k: number) => k >= 50_000 && (name === "linear-scan");

const mark = (name: string) => (TEAM_CHOICE.has(name) ? `**${name}**` : name);
const nsPerOp = (ns: number, ops: number) => (ns / ops).toFixed(ns / ops >= 100 ? 0 : 1);

// ---- Workload A: fill K reservations, then drain them all ---------------------------------------
function fillDrain(make: () => Dispatcher, items: Reservation[]): number {
  const d = make();
  const t0 = nowNs();
  for (const r of items) d.push(r);
  for (let i = 0; i < items.length; i++) d.popMin();
  return (nowNs() - t0) / (2 * items.length);
}

// ---- Workload B: steady state. Queue holds ~K; each step = one return (popMin) + one new hold (push) ----
function steady(make: () => Dispatcher, k: number, pool: Reservation[]) {
  const d = make();
  for (let i = 0; i < k; i++) d.push(pool[i]!);
  const perOp: number[] = [];
  let next = k;
  // warm-up
  for (let i = 0; i < 2000 && next < pool.length; i++) { d.popMin(); d.push(pool[next++]!); }
  const batches = Math.floor((pool.length - next) / (BATCH / 2));
  for (let b = 0; b < batches; b++) {
    const t0 = nowNs();
    for (let i = 0; i < BATCH / 2; i++) { d.popMin(); d.push(pool[next++]!); }
    perOp.push((nowNs() - t0) / BATCH);
  }
  perOp.sort((a, b) => a - b);
  return { p50: percentile(perOp, 50), p99: percentile(perOp, 99) };
}

// ---- Workload C: churn with cancellations (hold cancelled or pickup window expired) -------------
function churn(make: () => Dispatcher, script: { preload: Reservation[]; ops: Op[] }): number {
  const d = make();
  for (const r of script.preload) d.push(r);
  const t0 = nowNs();
  for (const op of script.ops) {
    if (op.kind === "push") d.push(op.r!);
    else if (op.kind === "pop") d.popMin();
    else d.remove(op.id!);
  }
  return (nowNs() - t0) / script.ops.length;
}

// ---- Memory at K = 5,000 -----------------------------------------------------------------------
function memoryAt(make: () => Dispatcher, k: number): number {
  // Reservation objects are shared by every implementation, so measure only structure overhead:
  // retained bytes of (queue + items) minus retained bytes of the items alone.
  gc();
  const base = measureRetained(() => makeReservations(k, 6)).bytes;
  const { bytes } = measureRetained(() => {
    const d = make();
    const copy = makeReservations(k, 6);
    for (const r of copy) d.push(r);
    return { d, copy };
  });
  return Math.max(0, bytes - base);
}

const env = environmentInfo();
console.log(env);
const names = dispatcherFactories.map((f) => f().name);
const factoryOf = new Map(dispatcherFactories.map((f) => [f().name, f]));
const fillRows: Record<string, Record<number, TrialStat | null>> = {};
const steadyRows: Record<string, Record<number, { p50: TrialStat; p99: TrialStat } | null>> = {};
const churnRows: Record<string, Record<number, TrialStat | null>> = {};
const rng = mulberry32(2026);

for (const k of SIZES) {
  console.log(`K = ${fmtInt(k)}`);
  const script = churnScript(k, CHURN_OPS);
  const fillItems = makeReservations(k, 1);
  const steadyPool = makeReservations(k + CHURN_OPS, 2);
  const active = names.filter((name) => {
    if (!TOO_SLOW(name, k)) return true;
    (fillRows[name] ??= {})[k] = null; (steadyRows[name] ??= {})[k] = null; (churnRows[name] ??= {})[k] = null;
    return false;
  });
  // One untimed warm-up of every structure (JIT), then REPS timed trials in shuffled order.
  for (const name of active) { const make = factoryOf.get(name)!; fillDrain(make, fillItems); churn(make, script); }
  const fill: Record<string, number[]> = {};
  const st50: Record<string, number[]> = {};
  const st99: Record<string, number[]> = {};
  const ch: Record<string, number[]> = {};
  for (let rep = 0; rep < REPS; rep++) {
    for (const name of shuffled(active, rng)) {
      const make = factoryOf.get(name)!;
      gc();
      (fill[name] ??= []).push(fillDrain(make, fillItems));
      const s = steady(make, k, steadyPool);
      (st50[name] ??= []).push(s.p50);
      (st99[name] ??= []).push(s.p99);
      (ch[name] ??= []).push(churn(make, script));
    }
  }
  for (const name of active) {
    (fillRows[name] ??= {})[k] = trialStat(fill[name]!);
    (steadyRows[name] ??= {})[k] = { p50: trialStat(st50[name]!), p99: trialStat(st99[name]!) };
    (churnRows[name] ??= {})[k] = trialStat(ch[name]!);
  }
}

const memRows = dispatcherFactories.map((make) => ({ name: make().name, bytes: memoryAt(make, 5_000) }));

const cell = (v: TrialStat | null | undefined) => (v == null ? "skipped" : `${nsPerOp(v.median, 1)} (IQR ${nsPerOp(v.iqr, 1)})`);
const md: string[] = [];
md.push(`# Reservation dispatcher benchmark results${QUICK ? " (quick run)" : ""}\n`);
md.push(provenance(env));
md.push("Bold = **binary-heap+index**, the in-memory reference of the chosen dispatcher (an array binary heap with a position index, so a cancel is O(log K)). LIBRAS ships the dispatcher as the PostgreSQL queue measured in pg.md; plain binary-heap is the first milestone sketch, whose cancel is a linear search.");
md.push(`Role mix: 70% Student, 15% Faculty, 10% NTP, 5% Visitor. Priority = arrival time minus role weight. All numbers are nanoseconds per operation, median across ${REPS} trials (each trial runs every structure once, in a shuffled order) with the IQR across trials; lower is better. "skipped" = quadratic and impractically slow at that size.\n`);
md.push("## A. Fill K reservations then drain them all (ns per operation)\n");
md.push(mdTable(["Dispatcher", ...SIZES.map((k) => `K=${fmtInt(k)}`)], names.map((n) => [mark(n), ...SIZES.map((k) => cell(fillRows[n]![k]))])));
md.push("\n## B. Steady state: each step is one return (popMin) plus one new hold (push), queue stays ~K\n");
md.push("Per-operation p50 and p99 within a trial, measured over batches of 500 operations; median across trials (IQR of the p50 in brackets).\n");
md.push(mdTable(["Dispatcher", ...SIZES.map((k) => `K=${fmtInt(k)} p50 / p99`)], names.map((n) => [mark(n), ...SIZES.map((k) => {
  const v = steadyRows[n]![k];
  return v ? `${nsPerOp(v.p50.median, 1)} / ${nsPerOp(v.p99.median, 1)} (IQR ${nsPerOp(v.p50.iqr, 1)})` : "skipped";
})])));
md.push("\n## C. Churn with cancellations: 40% push, 40% popMin, 20% cancel/expire a random queued hold (ns per operation)\n");
md.push(mdTable(["Dispatcher", "Fast cancel?", ...SIZES.map((k) => `K=${fmtInt(k)}`)], dispatcherFactories.map((make) => {
  const d = make();
  return [mark(d.name), d.supportsFastRemove ? "yes" : "no (O(K))", ...SIZES.map((k) => cell(churnRows[d.name]![k]))];
})));
{
  const first = SIZES[0]!;
  const last = SIZES[SIZES.length - 1]!;
  const growth = (name: string) => {
    const a = churnRows[name]?.[first];
    const b = churnRows[name]?.[last];
    return a && b ? `x${(b.median / a.median).toFixed(1)}` : "n/a";
  };
  md.push(`\nGrowth of the churn cost from K = ${fmtInt(first)} to K = ${fmtInt(last)}: binary-heap (linear cancel) ${growth("binary-heap")}, binary-heap+index ${growth("binary-heap+index")}, binary-heap+lazy-delete ${growth("binary-heap+lazy-delete")}, pairing-heap+lazy-delete ${growth("pairing-heap+lazy-delete")}. A queue whose cancel is a linear search degrades with K; the chosen reference needs no cap on K.`);
}
md.push("\n## D. Structure memory at K = 5,000 (excluding the reservation records themselves)\n");
md.push(mdTable(["Dispatcher", "Overhead (KB)"], memRows.map((r) => [mark(r.name), (r.bytes / 1024).toFixed(0)])));
md.push("");

console.log("\n" + md.join("\n"));
const suffix = QUICK ? "-quick" : "";
writeResult(`heap${suffix}.json`, { env, quick: QUICK, sizes: SIZES, reps: REPS, fillRows, steadyRows, churnRows, memRows });
writeResult(`heap${suffix}.md`, md.join("\n"));
console.log(`Wrote results/heap${suffix}.{json,md}`);
