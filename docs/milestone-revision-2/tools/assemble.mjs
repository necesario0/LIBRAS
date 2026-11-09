// Assembles the full Revision 2 milestone Markdown from the hand-written parts and the
// revised sections in docs/revised-milestone-sections.md.
//   node assemble.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const part = (f) => fs.readFileSync(path.join(root, "parts", f), "utf8").trim();
const revised = fs.readFileSync(path.join(root, "..", "revised-milestone-sections.md"), "utf8").replace(/\r\n/g, "\n");

function slice(startMarker, endMarker) {
  const a = revised.indexOf(startMarker);
  const b = endMarker ? revised.indexOf(endMarker, a + 1) : revised.length;
  if (a < 0 || b < 0) throw new Error(`marker not found: ${startMarker} / ${endMarker}`);
  return revised.slice(a, b).replace(/\n---\s*$/, "").trim();
}
function sub(text, from, to) {
  if (!text.includes(from)) throw new Error(`replacement target not found: ${from.slice(0, 70)}`);
  return text.replace(from, to);
}

// ---- Task 2 ----------------------------------------------------------------------------------
let task2 = slice("## Task 2:", "## Task 3:");
task2 = sub(task2, "## Task 2: Algorithmic Paradigm Selection and Logic Specification (Revised)", "## Task 2: Algorithmic Paradigm Selection & Logic Specification");
task2 = sub(task2, "Levenshtein (1966); Ukkonen (1985); Cormen, Leiserson, Rivest and Stein (CLRS, 4th ed., 2022); Knuth (1998); Schulz and Mihov (2002); PostgreSQL 16 documentation",
  "Levenshtein (1966) [1]; Ukkonen (1985) [23]; Cormen, Leiserson, Rivest and Stein (CLRS, 4th ed., 2022) [2]; Knuth (1998) [3]; Navarro (2001) [9]; Schulz and Mihov (2002) [10]; PostgreSQL 16 documentation [28]");
task2 = sub(task2, "**Recurrence (edit distance row).**",
  "**Recurrence (edit distance matrix).** Let `D(i, j)` be the Levenshtein distance between the first `i` letters of the query `Q` and the first `j` letters of a word `w`. Then `D(i, 0) = i`, `D(0, j) = j`, and for `i, j >= 1`: `D(i, j) = D(i-1, j-1)` if `q_i = w_j`, otherwise `D(i, j) = 1 + min( D(i-1, j), D(i, j-1), D(i-1, j-1) )`, corresponding to deletion, insertion and substitution.\n\n**Recurrence (edit distance row).** The trie search computes one column of this matrix per trie node, which is stored as a row of `m + 1` cells.");
task2 = sub(task2, "Because `seq` is unique, the order is total and the winner is unique.",
  "Because `seq` is unique, the order is total and the winner is unique.\n\n**Min-heap order invariant (in-memory reference implementation).** For the array-backed complete binary min-heap of the first submission, `PriorityScore(Parent(i)) <= PriorityScore(i)` for all `i` in `[1, K-1]`, and the tree is complete (all levels full except possibly the last, filled left to right). This invariant makes the root the minimum, so extraction returns the same winner as the indexed query.");

// ---- Task 3 ----------------------------------------------------------------------------------
let task3 = slice("## Task 3:", "## Task 4:");
task3 = sub(task3, "## Task 3: Theoretical Asymptotic Analysis and Scalability Profiling (Revised)", "## Task 3: Theoretical Asymptotic Analysis & Scalability Profiling");
task3 = sub(task3, "### 3.1 Worst-Case Time Complexity (O)", "### 3.1 Worst-Case Time Complexity Derivations (O)");
task3 = sub(task3, "### 3.2 Average-Case and Best-Case Time", "### 3.2 Average-Case (Θ) and Best-Case (Ω) Time Complexity Evaluations");
task3 = sub(task3, "### 3.4 Big Data Dimensions (Volume, Velocity, Variety)", "### 3.4 Big Data Dimension (V³) Scalability Evaluation");
task3 = sub(task3, "### 3.5 Empirical Algorithm Selection (New)", "### 3.5 Empirical Algorithm Selection");
task3 = sub(task3, "| Cancel or expire | `O(log K)` | Primary-key lookup, then index maintenance |",
  "| Cancel or expire | `O(log K)` | Primary-key lookup, then index maintenance |\n\n**In-memory reference heap.** The array-backed min-heap of the first submission has the same order guarantees, and its derivations remain valid:\n\n- *Enqueue:* appending to the dynamic array is `O(1)` amortized. In the worst case the new hold has the smallest score in the heap, so it travels from the deepest leaf to the root. The height of a complete binary tree with `K` nodes is `h = floor(log_2 K)` and each level swap is `O(1)`, so `T_enqueue(worst) = O(log K)`.\n- *Extract-Min:* swapping the root with the last leaf is `O(1)`; the following `SiftDown` compares the node against at most two children per level for at most `floor(log_2 K)` levels, so `T_extract(worst) = O(log K)`.\n- *Peek:* inspecting `Heap[0]` is a single array dereference, `T_peek(worst) = O(1)`.");
task3 = sub(task3, "**Method.** All numbers come from the prototype",
  "**Candidates.** The alternatives follow standard techniques: cutoff dynamic programming over every word [23], the BK-tree [24], q-gram count filtering [25], symmetric-delete indexing (SymSpell) [27], PostgreSQL `pg_trgm` and `fuzzystrmatch` [28], and for queues the binary, 4-ary and pairing heaps [26] plus sorted and unsorted arrays.\n\n**Method.** All numbers come from the prototype");

// ---- Task 5.2 --------------------------------------------------------------------------------
let task52 = slice("### 5.2 Engineering Implementation and Benchmarking Tickets", "## Statements in the First Submission to Replace");
task52 = sub(task52, "### 5.2 Engineering Implementation and Benchmarking Tickets", "### 5.2 Engineering Implementation & Benchmarking Tickets");
task52 = "The operationalization backlog defines concrete tickets ready for sprint execution:\n\n" + task52.replace("### 5.2 Engineering Implementation & Benchmarking Tickets\n\n", "");
task52 = "### 5.2 Engineering Implementation & Benchmarking Tickets\n\n" + task52;

const appendix = `<!-- SLIDES -->

## Appendix A: Summary Presentation

The twelve summary slides that accompany this milestone follow. The same slides are in \`docs/milestone-revision-2/slides/\`.`;

const full = [
  part("00-front.md"),
  part("10-task1.md"),
  task2,
  task3,
  part("40-task4.md"),
  part("50-task5-stories.md") + "\n\n" + task52,
  part("60-task6.md"),
  part("70-references.md"),
  appendix,
].join("\n\n") + "\n";

fs.writeFileSync(path.join(root, "PBL-Milestone-1-Revision-2.md"), full);
console.log("wrote PBL-Milestone-1-Revision-2.md", full.length, "chars");
