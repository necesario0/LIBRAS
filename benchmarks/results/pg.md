# PostgreSQL candidate results

Generated 2026-11-09T18:57:02.752Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0. Database: PostgreSQL 16 in a local Docker container (Docker Desktop on Windows), default configuration. Round trips include Docker port-forwarding overhead, so absolute numbers are higher than a server on the same host as Node; relative ordering is the reliable part.

### Fuzzy search in PostgreSQL 16, N = 50,000 tokens, k = 2, 400 queries

Recall = share of the true within-2-edits words that the query returned; precision = share of returned words that are truly within 2 edits. Latency is the client round trip. The last two columns run all queries through 50 parallel connections.

| Candidate | Uses index | p50 (ms) | p95 (ms) | p99 (ms) | Recall | Precision | Queries/s at 50 clients | p95 at 50 clients (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pg-ilike-scan | no | 21.81 | 23.88 | 24.85 | 3.7% | 9.4% | 257 | 312 |
| pg-levenshtein-scan | no | 8.85 | 10.46 | 11.30 | 100.0% | 100.0% | 656 | 186 |
| pg-trgm-gin-0.3 | yes | 1.52 | 2.58 | 3.22 | 16.9% | 100.0% | 2,378 | 84.82 |
| pg-trgm-gin-0.1 | yes | 6.16 | 12.48 | 14.86 | 69.8% | 100.0% | 972 | 128 |

Table size 2056 kB, GIN trigram index size 1752 kB.

- **pg-ilike-scan**: Milestone baseline 1: ILIKE '%term%' with no index (substring match, not edit distance)
- **pg-levenshtein-scan**: fuzzystrmatch levenshtein_less_equal over every row, with a length prefilter (exact, no index)
- **pg-trgm-gin-0.3**: pg_trgm GIN candidate filter (default similarity threshold 0.3) then exact levenshtein verify
- **pg-trgm-gin-0.1**: pg_trgm GIN candidate filter with a low threshold (0.1) for higher recall, then exact verify

### Hold dispatch in PostgreSQL 16, K = 5,000 holds for one title

Dispatch is an indexed `DELETE ... WHERE id = (SELECT ... ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED)`, which is atomic and transactional. Latencies are client round trips in milliseconds.

| Workload | p50 (ms) | p95 (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Steady state (pop and push, each timed) | 1.67 | 2.19 | 2.58 |
| Churn with cancels (40% push, 40% pop, 20% cancel) | 1.62 | 1.99 | 2.36 |

- Serve order for 500 consecutive pops matches the in-memory binary heap: **yes**.
- 50 concurrent clients drained 2,000 holds in 0.42 s: 2,000 served, **2,000 distinct** (no hold was served twice).
- With `SKIP LOCKED`, a client that finds the top hold locked takes the next one, so strict global priority order is not guaranteed under concurrency, but no hold is lost or served twice. Dropping `SKIP LOCKED` would serialise clients and keep strict order at the cost of waiting.
