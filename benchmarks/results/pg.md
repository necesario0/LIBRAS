# PostgreSQL candidate results

Generated 2026-11-26T12:27:20.282Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70.
Server: PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2) on x86_64-pc-linux-gnu at 127.0.0.1:55432 on this machine, inside a Linux container or VM reached through loopback port forwarding (the client runs on win32); shared_buffers 128MB, max_connections 100. Client: Node v24.16.0 on win32 x64. Default configuration. Latencies are client round trips, so they include the connection; compare candidates with each other rather than with the in-process benchmarks.

### Fuzzy search in PostgreSQL, N = 50,000 tokens, k = 2, 400 queries

Recall = share of the true within-2-edits words that the query returned; precision = share of returned words that are truly within 2 edits. Latency is the client round trip, median across 5 trials (IQR across trials for p95). The last two columns run all queries through 50 parallel connections.

| Candidate | Uses index | p50 (ms) | p95 (ms) | p99 (ms) | Recall | Precision | Queries/s at 50 clients | p95 at 50 clients (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pg-ilike-scan | no | 39.96 | 43.66 (IQR 0.359) | 45.96 | 3.7% | 9.4% | 190 | 450 |
| pg-levenshtein-scan | no | 15.68 | 17.02 (IQR 0.053) | 17.68 | 100.0% | 100.0% | 501 | 217 |
| pg-trgm-gin-0.3 | yes | 2.79 | 4.88 (IQR 0.029) | 5.88 | 16.9% | 100.0% | 1,683 | 149 |
| pg-trgm-gin-0.1 | yes | 10.81 | 22.41 (IQR 0.487) | 27.11 | 69.8% | 100.0% | 628 | 204 |

Table size 2056 kB, GIN trigram index size 1752 kB.

- **pg-ilike-scan**: Milestone baseline 1: ILIKE '%term%' with no index (substring match, not edit distance)
- **pg-levenshtein-scan**: fuzzystrmatch levenshtein_less_equal over every row, with a length prefilter (exact, no index)
- **pg-trgm-gin-0.3**: pg_trgm GIN candidate filter (default similarity threshold 0.3) then exact levenshtein verify
- **pg-trgm-gin-0.1**: pg_trgm GIN candidate filter with a low threshold (0.1) for higher recall, then exact verify

#### Failure-mode breakdown

Share of queries for which the candidate did NOT return the word the typo was made from (the intended word; lower is better). Each query is counted three times: by the edit operations applied, by its true Levenshtein distance to the intended word, and by length. An exact k = 2 search must find every intended word at distance 0 to 2 and cannot find one at distance 3 or more. An adjacent transposition costs 2 in Levenshtein distance, so a transposition plus any other edit can land beyond k = 2.

| Query category | Queries | libras-flat-trie miss rate | pg-trgm-gin-0.3 miss rate | pg-trgm-gin-0.1 miss rate | pg-ilike-scan miss rate |
| --- | --- | --- | --- | --- | --- |
| no typo | 126 | 0.0% | 0.0% | 0.0% | 0.0% |
| one substitution | 32 | 0.0% | 6.3% | 0.0% | 96.9% |
| one deletion | 43 | 0.0% | 2.3% | 0.0% | 65.1% |
| one insertion | 22 | 0.0% | 0.0% | 0.0% | 100.0% |
| one transposition | 41 | 0.0% | 17.1% | 0.0% | 97.6% |
| two edit operations | 120 | 24.2% | 46.7% | 26.7% | 99.2% |
| Levenshtein distance 0 | 128 | 0.0% | 0.0% | 0.0% | 0.0% |
| Levenshtein distance 1 | 107 | 0.0% | 4.7% | 0.0% | 85.0% |
| Levenshtein distance 2 | 120 | 0.0% | 26.7% | 2.5% | 100.0% |
| Levenshtein distance 3+ (beyond k) | 29 | 100.0% | 100.0% | 100.0% | 100.0% |
| short word (3-6 chars) | 99 | 6.1% | 35.4% | 9.1% | 60.6% |
| medium word (7-12 chars) | 226 | 8.0% | 11.5% | 8.0% | 63.3% |
| long word (13+ chars) | 59 | 8.5% | 8.5% | 8.5% | 62.7% |

Example queries that pg-trgm-gin-0.3 misses:

| Query | Intended word | Edits applied | Levenshtein distance | Found by libras-flat-trie? | Found by pg-trgm-gin-0.1? |
| --- | --- | --- | --- | --- | --- |
| `abnako` | `anbako` | transposition | 2 | yes | yes |
| `ogide` | `godide` | transposition + deletion | 2 | yes | yes |
| `stro` | `stor` | transposition | 2 | yes | yes |
| `psourtcliboist` | `spourtclibiost` | transposition + transposition | 4 | NO | NO |
| `cakaliica` | `cakolicia` | transposition + substitution | 3 | NO | NO |
| `huolpoom` | `houploom` | transposition + transposition | 3 | NO | NO |
| `ithau` | `iotham` | deletion + substitution | 2 | yes | yes |
| `wotr` | `wourt` | deletion + transposition | 2 | yes | yes |
| `veeoo` | `vedeko` | substitution + deletion | 2 | yes | yes |
| `hce` | `che` | transposition + substitution | 2 | yes | NO |

Why: a trigram filter needs the query and the word to share enough three-letter groups. One edit in a word of length L destroys up to three of its L + 2 padded trigrams, so short words and edits near the middle drop below the similarity threshold even when the word is within k. An exact edit-distance search has no such filter; its only misses are words beyond k.

### Hold dispatch in PostgreSQL with the shipped schema and statement

Schema: `holds (id, book_id, status, score, seq, copy_id)` with the partial B-Tree index `holds_queue_idx (book_id, score, seq) WHERE status = 'waiting'` (supabase/migrations/20261112200000_holds.sql). Dispatch is the statement of apps/api/src/holds/dispatch.ts: `UPDATE ... WHERE id = (SELECT ... WHERE status = 'waiting' ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED)`. A cancel is `UPDATE ... SET status = 'cancelled'`, which takes the row out of the partial index: an O(log K) index delete, not a search of the queue.

- Serve order for 500 consecutive dispatches matches the in-memory reference heap: **yes**.

Per-operation round trip, p50 / p95 in ms (median across 5 trials, IQR of the p95 in brackets), churn script of 4,000 operations (40% new Hold, 40% dispatch, 20% cancel):

| Operation | K = 5,000 waiting Holds | K = 50,000 waiting Holds |
| --- | --- | --- |
| place a Hold | 2.79 / 3.28 (IQR 0.013) | 2.84 / 3.35 (IQR 0.116) |
| dispatch | 3.04 / 3.58 (IQR 0.043) | 3.11 / 3.70 (IQR 0.093) |
| cancel | 2.87 / 3.39 (IQR 0.046) | 2.91 / 3.52 (IQR 0.159) |

#### Priority order under concurrency (50 clients, 2,000 dispatch attempts on one title)

Each dispatch runs in its own transaction with 1 ms of further work before COMMIT, like a return. Order is the client-observed commit order. Kendall's tau compares commit order with priority order (1 = identical). Displacement = how many places a Hold's commit position is from its priority position among the served Holds. Left behind = Holds still waiting when the run stopped while a lower-priority Hold had been served; such a Hold is the top of the queue again, so the next dispatch serves it (a delay, not a loss).

| Variant | Served | Distinct | Dispatches/s | Kendall tau | Discordant pairs | Max displacement | Mean displacement | Left behind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SKIP LOCKED (shipped) | 2,000 | 2,000 | 1,099 | 0.9989 | 0.05% | 8 | 0.9 | 0 |
| SKIP LOCKED, 10% of returns roll back | 1,800 | 1,800 | 998 | 0.9939 | 0.30% | 70 | 4.6 | 2 |
| SKIP LOCKED, 5 clients hold the top Hold then roll back | 1,996 | 1,996 | 1,043 | 0.9929 | 0.36% | 35 | 6.3 | 4 |
| per-title advisory lock (strict) | 2,000 | 2,000 | 116 | 1.0000 | 0.00% | 0 | 0.0 | 0 |
| per-title advisory lock, 10% roll back | 1,800 | 1,800 | 105 | 1.0000 | 0.00% | 0 | 0.0 | 0 |
| per-title advisory lock, 5 lock holders | 2,000 | 2,000 | 83 | 1.0000 | 0.00% | 0 | 0.0 | 0 |

Reading the table: with SKIP LOCKED, concurrent dispatchers on one title each take the best Hold nobody else has locked. With clean commits, Holds of nearly equal priority only commit in a slightly different order, because transactions that started together finish in a different order. A real priority inversion needs a transaction that locks the top Hold and then rolls back (a failed return, or a cancel that fails): while it holds the lock, other dispatchers pass that Hold over. No Hold is served twice in any variant. The per-title advisory lock serialises dispatch for a title and keeps strict order in every variant, at a much lower throughput. In LIBRAS, concurrent dispatch on one title only happens when several Copies of that title come back in the same instant, and the 50-client run is a stress bound far above that.
