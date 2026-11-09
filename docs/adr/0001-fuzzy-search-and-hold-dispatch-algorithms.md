# 0001: Algorithms for fuzzy catalog search and hold dispatch

**Status:** Proposed (needs team confirmation)
**Date:** 2026-11-09
**Evidence:** [algorithm benchmark report](../algorithm-benchmark-report.md), raw output in `benchmarks/results/`

## Context

PBL Milestone 1 specified two algorithms: a Bounded Levenshtein Trie with DP branch-and-bound for OPAC fuzzy search, and a role-weighted complete binary min-heap for reservation dispatch. The team asked which algorithms are best for LIBRAS, and agreed that a competitor may beat the milestone's choice, with the milestone updated afterwards.

Constraints: search within 1.0 s at 50 concurrent patrons and about 250 queries/s peak (SRS); hold extraction within 10 ms; roughly 50,000 catalog tokens and up to 5,000 queued holds per title; stack is Node.js, Express and TypeScript on Render with PostgreSQL. Priorities, in order: correctness and latency, then simplicity, then memory.

## Decision

1. **Fuzzy search: use SymSpell (symmetric delete) as the primary engine**, verified with exact bounded Levenshtein, if the server can hold about 320 MB for the index. If it cannot, or the catalog changes often, use an in-process bigram inverted index with an exact count filter. The simplest option that still meets the SLA is an exact `levenshtein_less_equal` scan in PostgreSQL (p95 186 ms at 50 concurrent clients). Do not use `pg_trgm` as the fuzzy engine (17% recall at its default threshold), and do not use the literal trie, linear scan or BK-tree as the primary engine.
2. **Hold dispatch: use a PostgreSQL indexed query as the system of record** (`DELETE ... ORDER BY score, seq LIMIT 1 FOR UPDATE SKIP LOCKED`, about 1.7 ms, correct order, no double serves under 50 clients, durable). If an in-memory structure is kept, use the complete binary min-heap with an id-to-position index so cancellations and claim-window expiries are O(log K).

## Why

- All candidates that return exact results and exceed 250 queries/s sit two to three orders of magnitude inside the 1.0 s search SLA, so the SLA does not discriminate; latency headroom, simplicity and memory do.
- SymSpell is the fastest by a wide margin (p95 0.19 ms against 2.9 ms for the milestone trie at 50,000 tokens, k = 2) and ranks first under latency-first and balanced weightings.
- Its cost is memory (about 318 MB against 4 to 55 MB for the others), a 3-second build, and awkward incremental updates. Under a memory-lean weighting the bigram index ranks first.
- The milestone's trie, implemented literally, was slower than SymSpell and used 55 MB; flattened into typed arrays it drops to 4.4 MB and is roughly equal to the bigram index on speed, but is the longest implementation.
- `pg_trgm` returned only 17% of true matches at its default threshold (70% at a lowered one), so it cannot be the fuzzy engine. The exact PostgreSQL scan returned everything and met the SLA at 50 clients, which makes it the low-complexity option.
- For the dispatcher every in-memory heap variant is about 50,000x inside the 10 ms limit, so speed does not decide it. The PostgreSQL query is about 1.7 ms, still inside the limit, and is durable, transactional with the loan record, served in the same order as the heap, and served every hold exactly once under 50 concurrent clients. That removes a second copy of the queue to keep consistent.
- If an in-memory heap is kept, the binary heap is simplest and fastest on plain push and pop; its only weakness, cancellation cost, is fixed by an id index.

## Consequences

- PBL Milestone 1 needs updating: Task 2 pseudocode, Task 3 complexity analysis and memory figures, and the claims listed in section 5 of the report (the roughly 40-node-visit figure and the independence of search cost from catalog size do not hold).
- The search engine becomes a TypeScript module inside the Node API, not a separate Python service.
- A SymSpell index must be rebuilt or incrementally updated when the catalog changes, and rebuilt on process start (about 3 seconds at 50,000 tokens).
- A database dispatcher removes the need to keep an in-memory queue in sync, and the milestone's Redis-backed heap partitions become unnecessary. An in-memory heap, if used, is only a cache.

## Open items that could change this decision

- PostgreSQL numbers come from a local Docker container with default settings; re-measure on the Render database.
- Choosing a database dispatcher departs from the milestone's "complete binary heap" deliverable; the team must decide what the course deliverable should demonstrate.
- Results used synthetic data and one laptop; re-run on the real catalog and the Render instance.
- The Render plan's RAM limit has not been checked against the SymSpell footprint.
- Weights 60/25/15 (latency, simplicity, memory) are an interpretation of the agreed priorities and have not been confirmed by the team.
