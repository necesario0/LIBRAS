# 0001: Algorithms for fuzzy catalog search and hold dispatch

**Status:** Proposed (needs team confirmation)
**Date:** 2026-11-09
**Evidence:** [algorithm benchmark report](../algorithm-benchmark-report.md), raw output in `benchmarks/results/`

## Context

PBL Milestone 1 specified two algorithms: a Bounded Levenshtein Trie with DP branch-and-bound for OPAC fuzzy search, and a role-weighted complete binary min-heap for reservation dispatch. The team is redoing the milestone and asked which algorithms work best for the system, allowing competitors to beat the original choices.

Constraints: search within 1.0 s at 50 concurrent patrons and about 250 queries/s peak (SRS); hold extraction within 10 ms; roughly 50,000 catalog tokens and up to 5,000 queued holds per title; stack is Node.js, Express and TypeScript on Render with PostgreSQL. The team's requirements: for search, the lowest latency that does not use much more memory than the other options; for dispatch, whatever works best while staying light on the device.

## Decision

1. **Fuzzy search: Bounded Levenshtein Trie Search**, in its flattened form (`trie-dp-flat`): the milestone's algorithm (trie, one DP row per node, branch-and-bound on the row minimum) implemented with typed-array nodes, 32-bit child offsets, preallocated DP rows and an explicit stack. Rebuild and atomically swap the trie when the catalog changes.
2. **Hold dispatch: Role-Weighted Priority Queue Dispatcher**, implemented as a PostgreSQL indexed priority query that is the single hold queue: `DELETE FROM holds WHERE id = (SELECT id FROM holds WHERE title = $1 ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`, on an index over (title, score, seq), with the milestone's score (arrival time minus role weight). If an in-memory structure is ever needed as a cache, use the complete binary min-heap with an id-to-position index.

## Why

- **Search rule.** A candidate had to return exact results, exceed 250 queries/s on one thread, and use no more than twice the memory of the smallest such candidate; among those, the lowest p95 wins. SymSpell is the fastest (p95 0.19 ms) but uses about 318 MB and fails the memory gate. The literal trie (55 MB), BK-tree and linear scan also fail a gate.
- **Trie vs bigram index.** Only these two remain. In repeated, order-alternated runs the flat trie is faster from 50,000 tokens up (p95 0.73 ms against 1.25 ms at 50,000; 2.4 ms against 21.6 ms at 400,000) and smaller at every size (4.4 MB against 5.6 MB at 50,000). The bigram index is slightly faster only at 20,000 tokens.
- **Same algorithm, better implementation.** The flat version is about 12 times smaller and 1.7 times faster than the pseudocode implemented literally, so the milestone's algorithm survives; its data layout changes.
- **`pg_trgm` is ruled out for fuzzy matching:** it returned only 17% of true matches at its default threshold (70% at a lowered one).
- **Dispatch.** Every in-memory heap variant is far inside the 10 ms limit, so speed does not decide it. The PostgreSQL query is about 1.7 ms (p99 2.6 ms), serves in the same order as the heap, served every hold exactly once under 50 concurrent clients, uses no memory in the Node process, survives restarts, and is transactional with the loan record. That removes a second copy of the queue to keep consistent.

## Consequences

- PBL Milestone 1 needs updating (report section 6): Task 2 pseudocode and representation, Task 3 complexity and memory figures, removal of the Redis-backed heap partitions, and the claims in report section 5 (the roughly 40-node-visit figure and the independence of search cost from catalog size do not hold; the ILIKE baseline measured 22 ms, not 650 ms or more).
- The search engine is a TypeScript module inside the Node API, not a separate Python service.
- The flat trie is immutable: catalog changes trigger a rebuild (about 235 ms at 50,000 tokens) and an atomic swap. Searches in flight use the old trie.
- Search latency still grows slowly with catalog size (p50 1.3 ms at 400,000 tokens, against 0.42 ms at 50,000).
- Dispatch order under concurrency is not strictly global because `SKIP LOCKED` lets a client skip a locked row; no hold is lost or served twice. Dropping `SKIP LOCKED` would give strict order at the cost of waiting.

## Open items that could change this decision

- Results use synthetic data on one laptop, and PostgreSQL ran in a local Docker container with port-forwarding overhead. Re-run on the real catalog and the Render database.
- Single-thread, in-process search was not driven through Express with 50 concurrent users.
- Search matches whole tokens only; IDF and popularity ranking, multi-token titles and Unicode normalisation are not benchmarked.
