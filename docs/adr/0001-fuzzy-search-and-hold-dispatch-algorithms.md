# 0001: Algorithms for fuzzy catalog search and hold dispatch

**Status:** Proposed (needs team confirmation, and a re-check once PostgreSQL candidates are benchmarked)
**Date:** 2026-11-09
**Evidence:** [algorithm benchmark report](../algorithm-benchmark-report.md), raw output in `benchmarks/results/`

## Context

PBL Milestone 1 specified two algorithms: a Bounded Levenshtein Trie with DP branch-and-bound for OPAC fuzzy search, and a role-weighted complete binary min-heap for reservation dispatch. The team asked which algorithms are best for LIBRAS, and agreed that a competitor may beat the milestone's choice, with the milestone updated afterwards.

Constraints: search within 1.0 s at 50 concurrent patrons and about 250 queries/s peak (SRS); hold extraction within 10 ms; roughly 50,000 catalog tokens and up to 5,000 queued holds per title; stack is Node.js, Express and TypeScript on Render with PostgreSQL. Priorities, in order: correctness and latency, then simplicity, then memory.

## Decision

1. **Fuzzy search: use SymSpell (symmetric delete) as the primary engine**, verified with exact bounded Levenshtein, if the server can hold about 320 MB for the index. If it cannot, or the catalog changes often, use a bigram inverted index with a count filter, which also corresponds to PostgreSQL `pg_trgm`. Do not use the literal trie, linear scan or BK-tree as the primary engine.
2. **Hold dispatch: keep the complete binary min-heap and add an id-to-position index** so cancellations and claim-window expiries are O(log K).

## Why

- All candidates that return exact results and exceed 250 queries/s sit two to three orders of magnitude inside the 1.0 s search SLA, so the SLA does not discriminate; latency headroom, simplicity and memory do.
- SymSpell is the fastest by a wide margin (p95 0.19 ms against 2.9 ms for the milestone trie at 50,000 tokens, k = 2) and ranks first under latency-first and balanced weightings.
- Its cost is memory (about 318 MB against 4 to 55 MB for the others), a 3-second build, and awkward incremental updates. Under a memory-lean weighting the bigram index ranks first.
- The milestone's trie, implemented literally, was slower than SymSpell and used 55 MB; flattened into typed arrays it drops to 4.4 MB and is roughly equal to the bigram index on speed, but is the longest implementation.
- For the dispatcher every heap variant is about 50,000x inside the 10 ms limit. The binary heap is simplest and fastest on plain push and pop; its only weakness, cancellation cost, is fixed by an index.

## Consequences

- PBL Milestone 1 needs updating: Task 2 pseudocode, Task 3 complexity analysis and memory figures, and the claims listed in section 5 of the report (the roughly 40-node-visit figure and the independence of search cost from catalog size do not hold).
- The search engine becomes a TypeScript module inside the Node API, not a separate Python service.
- A SymSpell index must be rebuilt or incrementally updated when the catalog changes, and rebuilt on process start (about 3 seconds at 50,000 tokens).
- The dispatcher is an in-memory structure; durability across restarts needs a design decision (database or Redis as source of truth).

## Open items that could change this decision

- PostgreSQL-based options (`pg_trgm` GIN, `ILIKE`, indexed `ORDER BY priority LIMIT 1`) are not yet measured. A database-side dispatcher is transactional and survives restarts.
- Results used synthetic data and one laptop; re-run on the real catalog and the Render instance.
- The Render plan's RAM limit has not been checked against the SymSpell footprint.
- Weights 60/25/15 (latency, simplicity, memory) are an interpretation of the agreed priorities and have not been confirmed by the team.
