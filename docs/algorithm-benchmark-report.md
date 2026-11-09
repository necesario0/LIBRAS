# LIBRAS algorithm benchmark report

Compares the two algorithms chosen in PBL Milestone 1 against alternatives, to decide which are best for the LIBRAS project.

- **Search engine under test:** Bounded Levenshtein Trie Automaton Search (DP matrix, branch-and-bound).
- **Dispatcher under test:** Role-Weighted Composite Min-Heap Hold Dispatcher (complete binary heap).
- **Code and raw results:** [`benchmarks/`](../benchmarks/README.md). **Decision record:** [ADR 0001](adr/0001-fuzzy-search-and-hold-dispatch-algorithms.md).

Status: draft for the team to review. The results are reported as measured; the recommendation follows them, including where it differs from the submitted milestone.

## 1. Summary

| Question | Finding |
| --- | --- |
| Does the milestone's trie meet the SLAs? | Yes, by a wide margin. p99 is 3.9 ms at N = 50,000 and k = 2 against a 1.0 s limit, at 530 queries/s on one thread against a 250 queries/s peak. |
| Is it the best search option? | No, on latency. SymSpell is about 39x faster at p50 and 15x at p95 (0.19 ms vs 2.9 ms) but needs about 318 MB of RAM against 4 to 55 MB for the trie and bigram index. A bigram index is the best balance on memory. |
| Which search option is recommended? | SymSpell under the agreed latency-first weighting, provided the server has the RAM; the bigram index if memory is tight. See section 4. |
| Is the heap the right dispatcher? | Yes. The binary heap family wins or ties everywhere that matters. Add an id-to-position index so cancellations and 48-hour claim expiries cost O(log K) instead of O(K). |
| Do the milestone's numbers hold? | Several do not (section 5). The 40-node-visit figure is off by about 200x and "independent of catalog size" is not what was measured. |

Everything below runs in memory on one thread with synthetic data. PostgreSQL-based candidates are not measured yet (section 7).

## 2. Method

- **Data.** The real UMak catalog is not available, so a seeded synthetic lexicon was generated: 50,000 unique tokens (mean length 9.4) from a mix of real academic words and syllable-model pseudo-words and surnames, plus a 20,000-token call-number and ISBN lexicon. Queries are lexicon words with 0 to 2 random edits (substitute, delete, insert, transpose) and 5% random no-match strings.
- **Correctness first.** Every candidate is tested against a brute-force full Levenshtein reference (27 automated tests) and returned zero mismatches in every benchmark query, at k = 1 and k = 2. Dispatchers are tested against a re-sorting queue model, including cancellations and FIFO order for equal roles.
- **Search candidates.** `trie-dp` (milestone pseudocode, implemented literally), `trie-dp-flat` (same algorithm in typed arrays), `linear-scan` (cutoff DP over every word), `bk-tree`, `symspell` (symmetric delete), `ngram-bigram` (bigram inverted index with count filter, the in-memory analogue of `pg_trgm`).
- **Dispatcher candidates.** Binary heap as specified, binary heap with id index, 4-ary heap with index, binary heap with lazy deletion, pairing heap with lazy deletion, sorted array, unsorted linear scan. Priority is arrival time minus role weight, as in the milestone.
- **Measurement.** Per-query nanosecond timing after warm-up; p50, p95 and p99 reported. Memory is retained bytes after a forced GC. Dispatcher costs are nanoseconds per operation, median of repeated runs, with p99 from batches of 500 operations.
- **Hardware.** AMD Ryzen 7 PRO 5850U laptop, 15.3 GB RAM, Node 24, Windows 11.

## 3. Results

### 3.1 Fuzzy search, N = 50,000 tokens, k = 2

| Candidate | p50 (ms) | p95 (ms) | p99 (ms) | Queries/s | Build | Retained |
| --- | --- | --- | --- | --- | --- | --- |
| **trie-dp (milestone)** | 1.74 | 2.93 | 3.99 | 553 | 46 ms | 55.3 MB |
| trie-dp-flat | 1.01 | 1.93 | 2.32 | 937 | 235 ms | 4.4 MB |
| linear-scan | 9.29 | 13.5 | 16.3 | 113 | none | none |
| bk-tree | 18.2 | 26.2 | 30.2 | 55 | 280 ms | 11.0 MB |
| symspell | 0.045 | 0.191 | 0.245 | 15,139 | 3.2 s | 318 MB |
| ngram-bigram | 1.15 | 1.97 | 4.24 | 823 | 179 ms | 5.6 MB |

Full tables, k = 1, the call-number lexicon and p95 by query length are in [`benchmarks/results/search.md`](../benchmarks/results/search.md). The ordering is the same on the call-number lexicon.

Observations:

- Every candidate that passes the 250 queries/s gate is two to three orders of magnitude inside the 1.0 s SLA. The choice among them is therefore about memory, simplicity and maintainability, not whether the SLA is met.
- `linear-scan` and `bk-tree` fail the single-thread 250 queries/s gate at k = 2 and are not viable on their own.
- The same trie algorithm is about 1.7x faster and 12x smaller when implemented with typed arrays (`trie-dp-flat`) than when written literally from the pseudocode with a `Map` per node. Implementation matters as much as algorithm choice here.
- SymSpell's speed comes from precomputing every deletion variant (about 35 entries per word). That costs 318 MB, a 3.2 s rebuild, and awkward updates when books are added or removed. It was skipped at 200,000 tokens to avoid exhausting memory.

### 3.2 Scaling with catalog size (p50, k = 2)

| N | 5,000 | 20,000 | 50,000 | 100,000 | 200,000 |
| --- | --- | --- | --- | --- | --- |
| trie-dp | 0.45 | 0.91 | 1.78 | 1.43 | 2.02 |
| trie-dp-flat | 0.25 | 0.49 | 0.81 | 0.57 | 0.79 |
| linear-scan | 0.79 | 3.45 | 9.37 | 9.41 | 37.2 |
| ngram-bigram | 0.10 | 0.43 | 1.29 | 1.90 | 5.20 |
| symspell | 0.05 | 0.06 | 0.05 | 0.04 | skipped |

The trie and SymSpell grow slowly; linear scan and the bigram index grow roughly with N. The non-monotonic trie entries at 100,000 are measurement noise from small per-size query sets (300 queries), so read the trend, not individual cells.

### 3.3 Hold dispatcher, nanoseconds per operation

K = number of queued holds. The milestone sizes K at up to 5,000.

| Dispatcher | Steady state p50, K=5,000 | Churn with cancels, K=5,000 | Churn with cancels, K=50,000 | Cancel cost |
| --- | --- | --- | --- | --- |
| **binary-heap (milestone)** | 89 | 123 | 7,631 | O(K) search |
| binary-heap+index | 217 | 102 | 409 | O(log K) |
| 4-ary-heap+index | 169 | 89 | 342 | O(log K) |
| binary-heap+lazy-delete | 101 | 76 | 402 | O(1), tombstone |
| pairing-heap+lazy-delete | 90 | 82 | 463 | O(1), tombstone |
| sorted-array | 208 | 133 | 19,531 | O(K) |
| linear-scan | 6,568 | 588 | skipped | O(K) |

Full tables including fill-and-drain, p99 and memory are in [`benchmarks/results/heap.md`](../benchmarks/results/heap.md).

Observations:

- At K = 5,000 every heap variant costs about 0.1 to 0.2 microseconds per operation against a 10 ms extraction budget, a margin of about 50,000x. The dispatcher will never be the bottleneck.
- The milestone's heap wins plain push and pop. Its weakness is cancellation: without an index, a cancel or claim-window expiry scans the array (7.6 microseconds per operation at K = 50,000 under churn). Adding an id-to-position map fixes this for a small constant-factor cost on push and pop.
- The 4-ary, lazy-delete and pairing heaps are competitive but none is better by enough to justify leaving the textbook structure.
- An unsorted scan is 70x slower than the heap at K = 5,000 in the steady state, yet still about 6.6 microseconds, so it would also meet the SLA. The heap is chosen on headroom and simplicity of reasoning, not necessity.

## 4. Decision

### 4.1 Fuzzy search

A weighted matrix ([`benchmarks/results/decision-matrix.md`](../benchmarks/results/decision-matrix.md)) scores only candidates that pass the gate (exact results, at least 250 queries/s):

| Weighting | Ranking |
| --- | --- |
| Latency-first (60 / 25 / 15 latency, simplicity, memory) | symspell > ngram-bigram > trie-dp > trie-dp-flat |
| Balanced (40 / 30 / 30) | symspell > ngram-bigram > trie-dp > trie-dp-flat |
| Memory-lean (25 / 25 / 50) | ngram-bigram > trie-dp-flat > symspell > trie-dp |

Process note: the first scoring formula (ratio to best) produced an absurd memory-lean ranking because one extreme candidate squashed all others, so it was replaced with min-max scoring before any result was reported. The weights 60/25/15 are my numeric reading of "correctness and latency first, then simplicity, then memory"; the team should confirm or adjust them.

**Recommendation.** Under the agreed priorities, SymSpell ranks first. Use it only if the deployed server can hold the index (about 320 MB at 50,000 tokens, on top of normal Node and Express usage); the Render plan's RAM limit should be checked before committing, which has not been done. If memory is constrained, or the catalog will change often, the bigram index is the better fit, and it maps directly onto PostgreSQL `pg_trgm`, which the security milestone already names as the fix for risk R-04. That makes the bigram index and `pg_trgm` the most defensible second choice. This choice should be revisited once the PostgreSQL candidates are measured.

The milestone's trie is not recommended as the primary engine: it is slower than SymSpell and uses far more memory than the bigram index in its literal form. If the team wants to keep a trie, use the flattened implementation.

### 4.2 Hold dispatcher

Keep the complete binary min-heap and add an id-to-position index (`binary-heap+index`) so that cancellations and claim-window expiries run in O(log K). This changes the milestone's text very little and removes its one real weakness.

## 5. Claims in the submitted milestone versus measurements

| Milestone claim | Measured | Verdict |
| --- | --- | --- |
| About 40 node visits for a 12-character query at k = 2 | About 8,400 nodes visited (about 1,000 at k = 1) | Off by about 200x |
| Pruning removes 98.4% of candidate branches | 96.7% of trie nodes never visited at k = 2, 99.6% at k = 1 | Close, but the figure depends on k and the milestone does not define "candidate branches" |
| Worst-case cost strictly independent of catalog size N | Nodes visited grew from 2,708 to 15,083 and latency from 0.49 ms to 4.98 ms as N went from 5,000 to 200,000 | Not independent in practice. The O(m^3 x alphabet^2) ceiling is valid, but real cost grows with N because more words fall inside the edit ball |
| Trie memory about 18.5 MB; nodes about 0.35 x N x L_avg | 55 MB literal implementation, 4.4 MB flattened; 0.545 x N x L_avg | Depends on implementation; node ratio higher on this data |
| Average search "well within the 35 ms SLA" | p99 3.9 ms | Holds |
| Heap under 400 KB for K = 5,000 | 551 KB including the reservation records in JavaScript; 53 KB for the heap structure alone | Depends on what is counted and on JavaScript object overhead |
| Random insert sifts up about 1.6 levels | 0.58 with the assumed role mix; 0 when all roles are equal | Holds only if most inserts outrank their parents; arrivals are time-ordered so most do not |
| Extraction under 10 ms | About 0.1 microseconds | Holds, by a huge margin |

The independence-from-N and 40-node figures are the ones to correct in the milestone. One caveat on the N result: the synthetic lexicon gets denser as it grows, because it is generated from one syllable model, which may exaggerate growth compared with a real catalog.

## 6. What changes in the milestone if the recommendation is adopted

- Task 2 (paradigm and pseudocode): replace the trie pseudocode with the chosen search structure; keep Algorithm 2 and add the id index.
- Task 3 (complexity): replace the trie bounds with those of the chosen structure. For SymSpell the build cost is O(N x L^k) in space and time for k deletions and query cost is dominated by generating and looking up query deletion variants plus verification.
- Task 3.4 (big data table): update the memory figures.
- Task 4: no change to service boundaries; the engine is a TypeScript module inside the Node API, not a separate Python service, which also differs from the submitted milestone.

## 7. Limitations and next steps

1. **PostgreSQL candidates are missing.** `pg_trgm` with a GIN index, `ILIKE` and an indexed `ORDER BY priority LIMIT 1` need a running PostgreSQL. Docker Desktop was not running on this machine. Starting it (or giving a connection string) lets these be added in one step. A database-side dispatcher also survives restarts and is transactional, which an in-memory heap is not; that matters for correctness.
2. **Synthetic data.** Re-run on real catalog exports when available, especially for pruning and branching figures.
3. **Single thread, in-process.** The SRS asks for 50 concurrent patrons; this was not simulated through Express and HTTP. The 250 queries/s gate was applied to single-thread throughput as a proxy.
4. **Search only matches whole tokens.** The IDF and popularity ranking, multi-token titles and Unicode normalisation are not benchmarked.
5. **One machine.** Numbers on Render will differ; the ordering between candidates is the reliable part.
