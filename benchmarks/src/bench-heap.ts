// Reservation dispatcher benchmark: team's binary min-heap vs alternatives.
//   npm run bench:heap
import { mulberry32, pick, randInt } from "./prng.ts";
import {
  environmentInfo, fmtInt, gc, mdTable, measureRetained, median, nowNs, percentile, writeResult,
} from "./harness.ts";
import { dispatcherFactories, TEAM_CHOICE } from "./registry.ts";
import { BinaryHeapDispatcher } from "./heap/binary-heap.ts";
import { makeReservation } from "./heap/types.ts";
import type { Dispatcher, Reservation, Role } from "./heap/types.ts";

const QUICK = process.argv.includes("--quick");
const SIZES = QUICK ? [100, 1_000, 5_000] : [100, 1_000, 5_000, 50_000];
const REPS = QUICK ? 3 : 7;
const CHURN_OPS = QUICK ? 20_000 : 100_000;
const BATCH = 500; // ops per timed batch for the p99 estimate (timer overhead is too large for single ops)
// Skip combinations that are quadratic and would take minutes; they are reported as "skipped".
const TOO_SLOW = (name: string, k: number) => k >= 50_000 && (name === "linear-scan");

const ROLES: Role[] = ["Faculty", "Student", "NTP", "Visitor"];

function makeReservations(count: number, seed: number): Reservation[] {
  const rng = mulberry32(seed);
  let t = 1_700_000_000_000;
  const out: Reservation[] = [];
  for (let i = 0; i < count; i++) {
    t += randInt(rng, 1, 5000);
    // Mostly students, some faculty/NTP, few visitors - roughly a university mix.
    const r = rng();
    const role: Role = r < 0.7 ? "Student" : r < 0.85 ? "Faculty" : r < 0.95 ? "NTP" : "Visitor";
    out.push(makeReservation(i, t, role));
  }
  return out;
}

const mark = (name: string) => (TEAM_CHOICE.has(name) ? `**${name}**` : name);
const nsPerOp = (ns: number, ops: number) => (ns / ops).toFixed(ns / ops >= 100 ? 0 : 1);

// ---- Workload A: fill K reservations, then drain them all ---------------------------------------
function fillDrain(make: () => Dispatcher, k: number) {
  const items = makeReservations(k, 1);
  const samples: number[] = [];
  for (let rep = -1; rep < REPS; rep++) {
    const d = make();
    const t0 = nowNs();
    for (const r of items) d.push(r);
    for (let i = 0; i < k; i++) d.popMin();
    if (rep >= 0) samples.push(nowNs() - t0); // rep -1 is an untimed JIT warm-up
  }
  return median(samples) / (2 * k);
}

// ---- Workload B: steady state. Queue holds ~K; each step = one return (popMin) + one new hold (push) ----
function steady(make: () => Dispatcher, k: number) {
  const pool = makeReservations(k + CHURN_OPS, 2);
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

// ---- Workload C: churn with cancellations (hold cancelled or 48h claim window expired) ----------
interface Op { kind: "push" | "pop" | "remove"; r?: Reservation; id?: number }

function churnScript(k: number): { preload: Reservation[]; ops: Op[] } {
  const rng = mulberry32(3);
  const pool = makeReservations(k + CHURN_OPS, 4);
  const model = new BinaryHeapDispatcher(true); // only used to keep the live set consistent
  const live: number[] = [];
  const pos = new Map<number, number>();
  const addLive = (id: number) => { pos.set(id, live.length); live.push(id); };
  const dropLive = (id: number) => {
    const i = pos.get(id)!; const last = live.pop()!;
    pos.delete(id);
    if (i < live.length) { live[i] = last; pos.set(last, i); }
  };
  const preload = pool.slice(0, k);
  for (const r of preload) { model.push(r); addLive(r.id); }
  let next = k;
  const ops: Op[] = [];
  while (ops.length < CHURN_OPS && next < pool.length) {
    const x = rng();
    if (x < 0.4 || live.length === 0) {
      const r = pool[next++]!; ops.push({ kind: "push", r }); model.push(r); addLive(r.id);
    } else if (x < 0.8) {
      const top = model.popMin()!; ops.push({ kind: "pop" }); dropLive(top.id);
    } else {
      const id = live[randInt(rng, 0, live.length - 1)]!;
      ops.push({ kind: "remove", id }); model.remove(id); dropLive(id);
    }
  }
  void pick;
  return { preload, ops };
}

function churn(make: () => Dispatcher, script: { preload: Reservation[]; ops: Op[] }) {
  const samples: number[] = [];
  for (let rep = -1; rep < REPS; rep++) {
    const d = make();
    for (const r of script.preload) d.push(r);
    const t0 = nowNs();
    for (const op of script.ops) {
      if (op.kind === "push") d.push(op.r!);
      else if (op.kind === "pop") d.popMin();
      else d.remove(op.id!);
    }
    if (rep >= 0) samples.push(nowNs() - t0); // rep -1 is an untimed JIT warm-up
  }
  return median(samples) / script.ops.length;
}

// ---- Memory at K = 5,000 -----------------------------------------------------------------------
function memoryAt(make: () => Dispatcher, k: number): number {
  const items = makeReservations(k, 6);
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
  void items;
  return Math.max(0, bytes - base);
}

const env = environmentInfo();
console.log(env);
const names = dispatcherFactories.map((f) => f().name);
const fillRows: Record<string, Record<number, number | null>> = {};
const steadyRows: Record<string, Record<number, { p50: number; p99: number } | null>> = {};
const churnRows: Record<string, Record<number, number | null>> = {};

for (const k of SIZES) {
  console.log(`K = ${fmtInt(k)}`);
  const script = churnScript(k);
  for (const make of dispatcherFactories) {
    const name = make().name;
    if (TOO_SLOW(name, k)) {
      (fillRows[name] ??= {})[k] = null; (steadyRows[name] ??= {})[k] = null; (churnRows[name] ??= {})[k] = null;
      continue;
    }
    (fillRows[name] ??= {})[k] = fillDrain(make, k);
    (steadyRows[name] ??= {})[k] = steady(make, k);
    (churnRows[name] ??= {})[k] = churn(make, script);
  }
}

const memRows = dispatcherFactories.map((make) => ({ name: make().name, bytes: memoryAt(make, 5_000) }));

const cell = (v: number | null | undefined) => (v == null ? "skipped" : nsPerOp(v, 1));
const md: string[] = [];
md.push(`# Reservation dispatcher benchmark results${QUICK ? " (quick run)" : ""}\n`);
md.push(`Generated ${env.date} on ${env.cpus}, ${env.totalMemGB} GB RAM, Node ${env.node}, ${env.platform}. Bold = the team's chosen design.`);
md.push("Role mix: 70% Student, 15% Faculty, 10% NTP, 5% Visitor. Priority = arrival time minus role weight (milestone definition). All numbers are nanoseconds per operation; lower is better. \"skipped\" = quadratic and impractically slow at that size.\n");
md.push("## A. Fill K reservations then drain them all (ns per operation, median of runs)\n");
md.push(mdTable(["Dispatcher", ...SIZES.map((k) => `K=${fmtInt(k)}`)], names.map((n) => [mark(n), ...SIZES.map((k) => cell(fillRows[n]![k]))])));
md.push("\n## B. Steady state: each step is one return (popMin) plus one new hold (push), queue stays ~K\n");
md.push("Median (p50) and p99 per-operation cost, measured over batches of 500 operations.\n");
md.push(mdTable(["Dispatcher", ...SIZES.map((k) => `K=${fmtInt(k)} p50 / p99`)], names.map((n) => [mark(n), ...SIZES.map((k) => {
  const v = steadyRows[n]![k];
  return v ? `${nsPerOp(v.p50, 1)} / ${nsPerOp(v.p99, 1)}` : "skipped";
})])));
md.push("\n## C. Churn with cancellations: 40% push, 40% popMin, 20% cancel/expire a random queued hold (ns per operation)\n");
md.push(mdTable(["Dispatcher", "Fast cancel?", ...SIZES.map((k) => `K=${fmtInt(k)}`)], dispatcherFactories.map((make) => {
  const d = make();
  return [mark(d.name), d.supportsFastRemove ? "yes" : "no (O(K))", ...SIZES.map((k) => cell(churnRows[d.name]![k]))];
})));
md.push("\n## D. Structure memory at K = 5,000 (excluding the reservation records themselves)\n");
md.push(mdTable(["Dispatcher", "Overhead (KB)"], memRows.map((r) => [mark(r.name), (r.bytes / 1024).toFixed(0)])));
md.push("");

console.log("\n" + md.join("\n"));
const suffix = QUICK ? "-quick" : "";
writeResult(`heap${suffix}.json`, { env, quick: QUICK, sizes: SIZES, fillRows, steadyRows, churnRows, memRows });
writeResult(`heap${suffix}.md`, md.join("\n"));
console.log(`Wrote results/heap${suffix}.{json,md}`);
