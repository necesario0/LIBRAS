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
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
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

export function environmentInfo() {
  const c = os.cpus();
  return {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpus: `${c.length}x ${c[0]?.model.trim() ?? "unknown"}`,
    totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
    date: new Date().toISOString(),
  };
}
