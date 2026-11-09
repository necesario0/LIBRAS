# LIBRAS algorithm benchmark report

Compares the two algorithms chosen in PBL Milestone 1 against alternatives, to decide which are best for the LIBRAS project.

- **Search engine under test:** Bounded Levenshtein Trie Automaton Search (DP matrix, branch-and-bound).
- **Dispatcher under test:** Role-Weighted Composite Min-Heap Hold Dispatcher (complete binary heap).
- **Code and raw results:** [`benchmarks/`](../benchmarks/README.md). **Decision record:** [ADR 0001](adr/0001-fuzzy-search-and-hold-dispatch-algorithms.md).

Status: draft for the team to review. The results are reported as measured; the recommendation follows them and the team's stated requirement (lowest latency that stays light on memory), including where it differs from the submitted milestone.

## 1. Summary

| Question | Finding |
| --- | --- |
| Does the milestone's trie meet the SLAs? | Yes, by a wide margin. p99 is 3.9 ms at N = 50,000 and k = 2 against a 1.0 s limit, at 530 queries/s on one thread against a 250 queries/s peak. |
| Is it the best search option? | Not as written. SymSpell is far faster (p95 0.19 ms) but needs about 318 MB. Within the memory the team is willing to spend, the best option is the same trie algorithm implemented with flat typed arrays: p95 0.73 ms at 50,000 tokens and 4.4 MB, and it stays fastest as the catalog grows (section 3.5). |
| Which search option is recommended? | **The flattened Bounded Levenshtein Trie** (`trie-dp-flat`). It is the lowest-latency exact option that stays light on memory. `pg_trgm` is not acceptable as the fuzzy engine because it misses most matches (section 3.4). |
| Which dispatcher is recommended? | **A PostgreSQL indexed priority query** as the single queue. It needs no memory in the Node process, dispatches in about 1.7 ms against a 10 ms limit, serves holds in the same order as the heap, and served each hold once under 50 concurrent clients (section 3.4). An in-memory binary heap with an id index is the fallback if a cache is ever needed. |
| Do the milestone's numbers hold? | Several do not (section 5). The 40-node-visit figure is off by about 200x, "independent of catalog size" is not what was measured, and the ILIKE baseline measured 22 ms, not the 650 ms or more claimed. |

The in-memory numbers run on one thread with synthetic data. The PostgreSQL numbers use a local Docker container, so they include port-forwarding overhead.

## 2. Method

- **Data.** The real UMak catalog is not available, so a seeded synthetic lexicon was generated: 50,000 unique tokens (mean length 9.4) from a mix of real academic words and syllable-model pseudo-words and surnames, plus a 20,000-token call-number and ISBN lexicon. Queries are lexicon words with 0 to 2 random edits (substitute, delete, insert, transpose) and 5% random no-match strings.
- **Correctness first.** Every candidate is tested against a brute-force full Levenshtein reference (27 automated tests) and returned zero mismatches in every benchmark query, at k = 1 and k = 2. Dispatchers are tested against a re-sorting queue model, including cancellations and FIFO order for equal roles.
- **Search candidates.** `trie-dp` (milestone pseudocode, implemented literally), `trie-dp-flat` (same algorithm in typed arrays), `linear-scan` (cutoff DP over every word), `bk-tree`, `symspell` (symmetric delete), `ngram-bigram` (bigram inverted index with an exact count filter; unlike PostgreSQL `pg_trgm` it never drops a true match). PostgreSQL candidates are covered in section 3.4.
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

### 3.4 PostgreSQL candidates

PostgreSQL 16 in a local Docker container, same 50,000-token lexicon, k = 2, 400 queries. Latency is a client round trip. Recall is the share of truly matching words returned. Full output: [`benchmarks/results/pg.md`](../benchmarks/results/pg.md).

| Candidate | Index | p50 (ms) | p95 (ms) | Recall | Queries/s at 50 clients | p95 at 50 clients (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| ILIKE '%term%' (milestone baseline 1) | none | 21.8 | 23.9 | 3.7% | 257 | 312 |
| `levenshtein_less_equal` scan (exact) | none | 8.85 | 10.5 | 100% | 656 | 186 |
| `pg_trgm` GIN, default threshold 0.3, then verify | GIN | 1.52 | 2.58 | 16.9% | 2,378 | 84.8 |
| `pg_trgm` GIN, threshold 0.1, then verify | GIN | 6.16 | 12.5 | 69.8% | 972 | 128 |

Observations:

- **`pg_trgm` is fast but misses most typo matches.** Trigram similarity is not edit distance: a short word with one or two edits can share too few trigrams to pass the threshold. Lowering the threshold raises recall but still misses 30% and costs latency. It cannot guarantee the "every word within 2 edits" result the milestone specifies, so it is not acceptable as the fuzzy engine on its own. This also qualifies the security milestone's R-04 countermeasure: a trigram GIN index fixes unindexed wildcard flooding, but it does not provide typo tolerance.
- **ILIKE is not a fuzzy search at all.** It returns substring matches, so it found 3.7% of the true matches, and it took about 22 ms at 50,000 tokens. The milestone's "650 ms or more" figure was not reproduced.
- **An exact scan in the database is viable at this scale.** `levenshtein_less_equal` with a length prefilter returns every correct match with no extra memory or synchronisation logic, and with 50 clients at once its p95 was 186 ms, inside the 1.0 s SLA. Its cost grows with catalog size, and it competes with transaction traffic for database CPU, so it has less headroom than an in-memory index.

Hold dispatch, K = 5,000 holds for one title, using an indexed `DELETE ... WHERE id = (SELECT ... ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED)`:

| Workload | p50 (ms) | p95 (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Steady state (each pop and push timed) | 1.67 | 2.19 | 2.58 |
| Churn with cancels (40% push, 40% pop, 20% cancel) | 1.62 | 1.99 | 2.36 |

- The serve order of 500 consecutive pops equals the in-memory binary heap's order.
- With 50 concurrent clients draining 2,000 holds, every hold was served exactly once (2,000 distinct of 2,000), which is the milestone's "zero race conditions" requirement. With `SKIP LOCKED`, strict global order is not guaranteed under concurrency (a client skips a locked top row), but nothing is lost or duplicated.
- At about 1.7 ms it is roughly 15,000 times slower than the in-memory heap, and still about six times inside the 10 ms limit.

### 3.5 Head-to-head: flattened trie vs bigram index

The two exact candidates that stay light on memory were re-measured with 3,000 queries per run, five runs with alternating order, and sizes up to 400,000 tokens. Values are the mean of per-run percentiles; full table in [`benchmarks/results/head-to-head.md`](../benchmarks/results/head-to-head.md).

| N (tokens) | k | trie-dp-flat p50 / p95 (ms) | ngram-bigram p50 / p95 (ms) | Memory, trie / bigram (MB) |
| --- | --- | --- | --- | --- |
| 20,000 | 2 | 0.27 / 0.51 | 0.23 / 0.40 | 1.8 / 2.2 |
| 50,000 | 2 | 0.42 / 0.73 | 0.69 / 1.25 | 4.4 / 5.6 |
| 100,000 | 2 | 0.62 / 1.13 | 1.97 / 4.25 | 8.7 / 11.1 |
| 200,000 | 2 | 0.84 / 1.53 | 4.48 / 8.05 | 16.9 / 22.6 |
| 400,000 | 2 | 1.32 / 2.44 | 13.0 / 21.6 | 32.6 / 46.3 |

- At 20,000 tokens and k = 2 the bigram index is slightly faster. From 50,000 tokens up the trie is faster, and by 400,000 tokens it is about nine times faster at k = 2 and about 100 times faster at k = 1.
- The trie is also smaller at every size.
- The single-run comparison in section 3.1 showed the two almost tied at 50,000 tokens (p95 1.93 ms against 1.97 ms). The repeated, order-alternated runs show the trie ahead, so the earlier tie was run-to-run noise.

## 4. Decision

### 4.1 Fuzzy search

The team's requirement is the lowest latency that is still light on memory. The rule, applied by [`benchmarks/src/decision-matrix.ts`](../benchmarks/src/decision-matrix.ts) and recorded in [`benchmarks/results/decision-matrix.md`](../benchmarks/results/decision-matrix.md), is:

1. Exact results (zero mismatches against brute force).
2. At least 250 queries/s on one thread at k = 2 (the SRS peak load).
3. Retained memory no more than twice the smallest candidate that passes gates 1 and 2 (8.8 MB here).
4. Among those, the lowest p95 latency.

| Candidate | p95 (ms) | Memory | Verdict |
| --- | --- | --- | --- |
| symspell | 0.19 | 318 MB | Fastest, but fails the memory gate |
| trie (literal, `Map` per node) | 2.93 | 55 MB | Fails the memory gate |
| bk-tree | 26.2 | 11 MB | Fails throughput and memory gates |
| linear-scan | 13.5 | none | Fails the throughput gate |
| ngram-bigram | 1.97 | 5.6 MB | Passes; slower than the trie from 50,000 tokens up |
| **trie-dp-flat** | **1.93 (0.73 in the head-to-head)** | **4.4 MB** | **Passes and is fastest** |

**Recommendation: the flattened Bounded Levenshtein Trie.** It keeps the milestone's algorithm (trie, one DP row per node, branch-and-bound on the row minimum) and changes only the implementation: typed-array nodes with 32-bit offsets, preallocated DP rows, and an explicit stack instead of recursion. That alone made it 12 times smaller and about 1.7 times faster than the literal pseudocode, and it keeps the fastest exact lookups of the light-memory options as the catalog grows.

Trade-offs to design for:

- The flat trie is immutable. When books are added or removed, build a new trie (about 235 ms at 50,000 tokens) and swap it in atomically, for example on a short schedule or after a batch of catalog changes. Searches in flight keep using the old trie.
- Latency still grows with catalog size (1.3 ms p50 at 400,000 tokens against 0.42 ms at 50,000), though far more slowly than the alternatives.
- Do not use `pg_trgm` for fuzzy matching (17% recall at its default threshold). Do not use SymSpell unless the memory budget changes: it would be roughly 4 to 10 times faster at 50,000 tokens (depending on which run is used) for roughly 70 times the memory.

An exact `levenshtein_less_equal` scan in PostgreSQL (p95 186 ms with 50 clients) is a valid zero-memory stopgap, but it is much slower and competes with transaction traffic for database CPU, so it is not the recommendation.

### 4.2 Hold dispatcher

**Recommendation: a PostgreSQL indexed priority query as the single hold queue**, and an in-memory binary heap with an id index only as a fallback or cache.

- One statement, `DELETE FROM holds WHERE id = (SELECT id FROM holds WHERE title = $1 ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`, on an index over (title, score, seq). The index is an ordered structure, so the lookup is O(log K) like the heap.
- It dispatched in about 1.7 ms (p99 2.6 ms), six times inside the 10 ms limit, and in the same order as the in-memory heap.
- With 50 concurrent clients draining 2,000 holds, each hold was served exactly once. Under concurrency the order is not strictly global because a client skips a locked row, but nothing is lost or duplicated.
- It uses no memory in the Node process, survives restarts, is transactional with the loan record, and removes any need to keep a second copy of the queue consistent, so it is the lightest option on the application server.
- The in-memory alternatives are also tiny (the binary heap with an id index is about 280 KB at 5,000 holds), so memory did not decide this. Durability and consistency did.

The role-weighted score (arrival time minus role weight) is unchanged, so the priority model in the milestone stays as written; only the structure that orders it changes.

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
| Extraction under 10 ms | About 0.1 microseconds in memory; about 1.7 ms through PostgreSQL | Holds in both cases |
| SQL `ILIKE '%term%'` degrades to 650 ms or more on tens of thousands of records | 22 ms at 50,000 tokens on a local container; also returns only 3.7% of the true fuzzy matches | Latency claim not reproduced on a token table (a larger table of full records may differ); the baseline is wrong for a different reason, because it is not a fuzzy match |

The independence-from-N and 40-node figures are the ones to correct in the milestone. One caveat on the N result: the synthetic lexicon gets denser as it grows, because it is generated from one syllable model, which may exaggerate growth compared with a real catalog.

## 6. What changes in the milestone

- **Task 2 (paradigm and pseudocode):** keep Algorithm 1 as the algorithm, and add the flat-array representation (child offsets, depth-indexed DP rows, explicit stack). Replace Algorithm 2 (heap) with the indexed priority query, keeping the score definition; keep the binary-heap pseudocode only as the in-memory equivalent.
- **Task 3 (complexity):** correct the trie analysis using section 5 (visited-node count, dependence on N). Search time is bounded by the edit-ball size and in practice grows slowly with N. Dispatch is O(log K) in the index.
- **Task 3.4 (big data table):** update memory figures (4.4 MB for 50,000 tokens in the flat trie) and remove the Redis-backed heap partitions.
- **Task 4:** the search engine is a TypeScript module inside the Node API, not a separate Python service. Document the atomic swap of the trie on catalog changes.
- **Baselines:** the ILIKE baseline is not a fuzzy match and measured 22 ms, not 650 ms; present it for what it is.

## 7. Limitations and next steps

1. **PostgreSQL numbers come from a Docker container on a Windows laptop**, default configuration, with port-forwarding overhead in every round trip. A server beside the Node process on Render will differ. A table of full bibliographic records (the milestone's ILIKE scenario) was not modelled; only the token table was.
2. **Synthetic data.** Re-run on real catalog exports when available, especially for pruning and branching figures.
3. **Single thread, in-process.** The SRS asks for 50 concurrent patrons; this was not simulated through Express and HTTP. The 250 queries/s gate was applied to single-thread throughput as a proxy.
4. **Search only matches whole tokens.** The IDF and popularity ranking, multi-token titles and Unicode normalisation are not benchmarked.
5. **One machine.** Numbers on Render will differ; the ordering between candidates is the reliable part.
