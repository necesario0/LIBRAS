// Empirical check of the worst-case node-visit bound for Bounded Levenshtein Trie Search.
//   npm run bench:worstcase
//
// The dictionary is EXHAUSTIVE: every string up to length m + k + 1 over an alphabet of `sigma` letters.
// That is the adversarial case in which no branch is absent from the trie, so the search visits every node
// it is allowed to by the pruning rule. We count visited nodes as the query length m grows (k = 2) and
// compare the growth against m^2 (the node count implied by the original milestone) and m^3 (the revised bound),
// and check that visited / (m^3 * sigma^3) stays bounded as sigma grows.
//
// Derivation being tested: a node is visited only if its parent's DP row has minimum <= k, i.e. the parent's
// string is within k edits of SOME PREFIX of the query. There are m + 1 prefixes and each has an edit ball of
// size O((m * sigma)^k), so EXPANDED nodes = O(m^(k+1) * sigma^k). Every expanded node has up to sigma children,
// each of which is visited, so VISITED nodes = O(m^(k+1) * sigma^(k+1)). For k = 2 that is m^3 * sigma^3, one factor
// of m more than the ball around the whole query alone.
import { mdTable, writeResult } from "./harness.ts";

function visitedNodes(sigma: number, m: number, k: number): number {
  const q = Array.from({ length: m }, (_, i) => i % sigma);
  const maxDepth = m + k + 1;
  let count = 0;
  const rec = (prev: number[], depth: number): void => {
    for (let ch = 0; ch < sigma; ch++) {
      count++;
      const cur = [prev[0]! + 1];
      let rowMin = cur[0]!;
      for (let c = 1; c <= m; c++) {
        const v = Math.min(cur[c - 1]! + 1, prev[c]! + 1, prev[c - 1]! + (q[c - 1] === ch ? 0 : 1));
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin <= k && depth + 1 < maxDepth) rec(cur, depth + 1);
    }
  };
  rec(Array.from({ length: m + 1 }, (_, i) => i), 0);
  return count;
}

const QUICK = process.argv.includes("--quick");
const K = 2;
const out: string[] = ["# Worst-case node visits, exhaustive dictionary, k = 2\n"];
out.push("Visited nodes for an exhaustive dictionary. If growth is O(m^3), visited / m^3 levels off to a constant; if it were O(m^2), visited / m^2 would level off instead.\n");
for (const sigma of QUICK ? [3] : [2, 3, 4]) {
  const rows: (string | number)[][] = [];
  const ms = QUICK ? [4, 6, 8] : sigma === 2 ? [6, 10, 14, 18, 22] : sigma === 3 ? [4, 6, 8, 10, 12] : [4, 6, 8, 10, 12, 14];
  for (const m of ms) {
    const v = visitedNodes(sigma, m, K);
    rows.push([m, v.toLocaleString("en-US"), (v / m ** 2).toFixed(1), (v / m ** 3).toFixed(1), (v / (m ** 3 * sigma ** 3)).toFixed(2)]);
  }
  out.push(`### Alphabet size ${sigma}\n`);
  out.push(mdTable(["m", "Nodes visited", "visited / m^2", "visited / m^3", "visited / (m^3 sigma^3)"], rows));
  out.push("");
}
console.log(out.join("\n"));
writeResult(QUICK ? "worst-case-quick.md" : "worst-case.md", out.join("\n"));
