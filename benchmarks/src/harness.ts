import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "results");

export function nowNs(): number {
  return Number(process.hrtime.bigint());
}

export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx]!;
}

export function summarize(samples: readonly number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    mean: sum / s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    max: s[s.length - 1]!,
  };
}

export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/** Linearly interpolated quantile (the R-7 / NumPy default), q in [0, 1]. */
export function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Spread of a statistic across independent trials: median, quartiles and interquartile range. */
export interface TrialStat { median: number; q1: number; q3: number; iqr: number; trials: number[] }

export function trialStat(trials: readonly number[]): TrialStat {
  const q1 = quantile(trials, 0.25);
  const q3 = quantile(trials, 0.75);
  return { median: quantile(trials, 0.5), q1, q3, iqr: q3 - q1, trials: [...trials] };
}

/** "1.23 (IQR 0.05)": median across trials in ms, with the interquartile range. */
export function fmtTrialMs(t: TrialStat): string {
  return `${fmtMs(t.median)} (IQR ${fmtMs(t.iqr)})`;
}

/** Fisher-Yates shuffle with a seeded generator, so trial orders are random but reproducible. */
export function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function gc(): void {
  const g = (globalThis as { gc?: () => void }).gc;
  if (!g) throw new Error("run with --expose-gc (use the npm scripts)");
  g();
  g();
}

/** Bytes retained by whatever `build` creates (heap + typed arrays), measured around a forced GC. */
export function measureRetained<T>(build: () => T): { value: T; bytes: number } {
  gc();
  const m0 = process.memoryUsage();
  const before = m0.heapUsed + m0.arrayBuffers;
  const value = build();
  gc();
  const m1 = process.memoryUsage();
  const after = m1.heapUsed + m1.arrayBuffers;
  return { value, bytes: Math.max(0, after - before) };
}

export function fmtMs(ns: number): string {
  const ms = ns / 1e6;
  if (ms >= 100) return ms.toFixed(0);
  if (ms >= 1) return ms.toFixed(2);
  return ms.toFixed(3);
}

export function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function mdTable(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

export function writeResult(file: string, content: string | object): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  writeFileSync(join(RESULTS_DIR, file), text.endsWith("\n") ? text : text + "\n");
}

/** The commit the benchmark code was run from, with "+dirty" when the measured code has uncommitted changes. Run from benchmarks/. */
export function sourceCommit(): string {
  try {
    const sha = execSync("git rev-parse --short=12 HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // Only the code that is measured counts; results/ and the notebook change during a run.
    const dirty = execSync("git status --porcelain -- src test package.json ../packages/shared/src ../apps/api/src/seed", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return "unknown";
  }
}

export function environmentInfo() {
  const c = os.cpus();
  return {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpus: `${c.length}x ${c[0]?.model.trim() ?? "unknown"}`,
    totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
    commit: sourceCommit(),
    date: new Date().toISOString(),
  };
}

/** One line for the top of every results file: when, where and from which commit it was generated. */
export function provenance(env: ReturnType<typeof environmentInfo>): string {
  return `Generated ${env.date} on ${env.cpus}, ${env.totalMemGB} GB RAM, Node ${env.node}, ${env.platform}, benchmark code at commit ${env.commit}.`;
}
