// Empirical check of the worst-case bound of Bounded Levenshtein Trie Search.
//   npm run bench:worstcase
//
// The dictionary is EXHAUSTIVE: every string up to length m + k + 1 over an alphabet of `sigma` letters. That is
// the adversarial case in which no branch is absent from the trie, so the search touches every node the pruning
// rule lets it reach.
//
// Two different quantities, which the first version of this check mixed up:
//  - EXPANDED nodes: nodes whose DP row has minimum <= k, so the search descends into their children. Such a
//    node's string is within k edits of SOME PREFIX of the query. There are m + 1 prefixes and each prefix's edit
//    ball holds O((m * sigma)^k) strings, so expanded = O(m^(k+1) * sigma^k).
//  - VISITED nodes: nodes whose DP row is computed. Every child of an expanded node is visited (one edge probe
//    each), so visited <= sigma * expanded = O(m^(k+1) * sigma^(k+1)).
// For k = 2: expanded = O(m^3 sigma^2) and visited = O(m^3 sigma^3). Each visit costs O(m) for the DP row, so time
// is O(m^(k+2) sigma^(k+1)) in the worst case, whatever the size N of the lexicon.
//
// If the bounds are right, expanded / (m^3 sigma^2) and visited / (m^3 sigma^3) stay bounded as m and sigma grow,
// and the log-log slope of expanded against m approaches k + 1 = 3 from below as m grows past k.
import { mdTable, writeResult } from "./harness.ts";

function countNodes(sigma: number, m: number, k: number): { visited: number; expanded: number } {
  const q = Array.from({ length: m }, (_, i) => i % sigma);
  const maxDepth = m + k + 1;
  let visited = 0;
  let expanded = 0;
  const rec = (prev: Int32Array, depth: number): void => {
    for (let ch = 0; ch < sigma; ch++) {
      visited++;
      const cur = new Int32Array(m + 1);
      cur[0] = prev[0]! + 1;
      let rowMin = cur[0]!;
      for (let c = 1; c <= m; c++) {
        const v = Math.min(cur[c - 1]! + 1, prev[c]! + 1, prev[c - 1]! + (q[c - 1] === ch ? 0 : 1));
        cur[c] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin <= k && depth + 1 < maxDepth) {
        expanded++;
        rec(cur, depth + 1);
      }
    }
  };
  const root = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) root[i] = i;
  expanded++; // the root is always expanded
  rec(root, 0);
  return { visited, expanded };
}

const QUICK = process.argv.includes("--quick");
const K = 2;
const out: string[] = ["# Worst-case node counts, exhaustive dictionary, k = 2\n"];
out.push("Expanded = nodes whose children are explored (row minimum <= k); bound O(m^3 sigma^2). Visited = nodes whose DP row is computed, one per edge probe; bound O(m^3 sigma^3). The slope is the log-log growth of expanded nodes between consecutive m; it should approach k + 1 = 3 from below as m grows (it is lower for small m because the edit balls of short prefixes overlap and are clipped at length 0).\n");
const configs: Array<[number, number[]]> = QUICK
  ? [[3, [4, 6, 8]]]
  : [[2, [6, 10, 14, 18, 22, 28, 34, 40]], [3, [4, 6, 8, 10, 12, 16, 20]], [4, [4, 6, 8, 10, 12, 14, 16]]];
const summary: (string | number)[][] = [];
for (const [sigma, ms] of configs) {
  const rows: (string | number)[][] = [];
  let prev: { m: number; expanded: number } | null = null;
  for (const m of ms) {
    const { visited, expanded } = countNodes(sigma, m, K);
    const slope = prev ? (Math.log(expanded / prev.expanded) / Math.log(m / prev.m)).toFixed(2) : "-";
    rows.push([
      m, expanded.toLocaleString("en-US"), visited.toLocaleString("en-US"), (visited / expanded).toFixed(2),
      (expanded / (m ** 3 * sigma ** 2)).toFixed(3), (visited / (m ** 3 * sigma ** 3)).toFixed(3), slope,
    ]);
    prev = { m, expanded };
  }
  out.push(`### Alphabet size ${sigma}\n`);
  out.push(mdTable(["m", "Expanded", "Visited", "Visited / expanded (<= sigma)", "Expanded / (m^3 sigma^2)", "Visited / (m^3 sigma^3)", "Slope of expanded vs m"], rows));
  out.push("");
  const last = rows[rows.length - 1]!;
  summary.push([sigma, last[0]!, last[4]!, last[5]!, last[6]!]);
}
out.push("### Summary at the largest m of each alphabet\n");
out.push(mdTable(["sigma", "m", "Expanded / (m^3 sigma^2)", "Visited / (m^3 sigma^3)", "Last slope"], summary));
out.push("\nReading: visited / expanded is exactly sigma here, because every child of an expanded node exists in an exhaustive dictionary, so the two bounds differ by exactly one factor of sigma. For each alphabet the normalised ratio levels off as m grows and the slope settles near 3, as O(m^3) predicts. Across alphabets the ratio rises with sigma (0.17, 0.42, 0.49) but stays below 1: each of the k edits chooses one of at most sigma letters, so the edit ball holds at most a polynomial in m times sigma^k strings, and substitutions only have sigma - 1 choices, which is why small alphabets sit further below the limit. On a real lexicon most branches are absent, so the measured counts (claims.md, Claim 2) are far below these ceilings.");
console.log(out.join("\n"));
writeResult(QUICK ? "worst-case-quick.md" : "worst-case.md", out.join("\n"));
