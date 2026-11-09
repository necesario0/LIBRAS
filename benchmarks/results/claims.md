# Verification of milestone claims

Generated 2026-11-09T18:39:38.122Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, Node v24.16.0. Synthetic data - see the caveat in src/data/catalog.ts: character-distribution-dependent figures (pruning, branching) must be re-checked on the real catalog.

## Claim 1 - Trie memory

Milestone: "approximately 18.5 MB" for 50,000 titles x 4 tokens x 6 chars; node count "compressed to approximately 0.35 x (N x L_avg)".

| Measure | Value |
| --- | --- |
| Lexicon | 50,000 unique synthetic tokens, mean length 9.4 chars |
| Trie nodes | 255,689 |
| Nodes / (N x L_avg) | 0.545 (claim: ~0.35) |
| Mean fan-out of internal nodes | 1.21 |
| Retained memory, spec-faithful trie (Map children) | 55.1 MB |
| Retained memory, flattened typed-array trie (32-bit offsets) | 4.4 MB |

## Claim 2 - Pruning and node visits

Milestone: "branch-and-bound pruning eliminates 98.4% of candidate branches"; "~40 node visits" for m = 12 at k = 2; "b_eff ~ 1.84". The milestone does not define b_eff or "candidate branches", so the fraction of trie nodes never visited is reported (the most natural reading of the 98.4% figure).

| Query length m | k | Nodes visited / query | Trie nodes never visited | Matches / query |
| --- | --- | --- | --- | --- |
| 6 | 1 | 947 | 99.63% | 1.0 |
| 6 | 2 | 7919 | 96.90% | 13.9 |
| 12 | 1 | 1036 | 99.59% | 0.4 |
| 12 | 2 | 8401 | 96.71% | 0.9 |
| 16 | 1 | 1030 | 99.60% | 0.4 |
| 16 | 2 | 8456 | 96.69% | 0.8 |

## Claim 3 - Search cost is independent of catalog size

Milestone: worst-case time is "strictly independent of the database lexicon size N". The O(m^3 |Sigma|^2) bound is a ceiling that holds for any N, but real cost can still grow with N because more dictionary words fall inside the edit ball. Measured at m = 12, k = 2:

| N (tokens) | Trie nodes | Nodes visited / query | p50 latency (ms) |
| --- | --- | --- | --- |
| 5,000 | 27,511 | 2708 | 0.489 |
| 20,000 | 102,696 | 5517 | 1.11 |
| 50,000 | 255,689 | 8152 | 1.74 |
| 100,000 | 507,341 | 11613 | 2.59 |
| 200,000 | 987,066 | 15083 | 4.98 |

## Claim 4 - Latency SLAs

Milestone: search within 1.0 s at 50 concurrent users (SRS); "well within the 35 ms SLA" (average case). Measured end-to-end of the algorithm only (no network or database), N = 50,000, k = 2, single thread:

| Implementation | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | queries/s |
| --- | --- | --- | --- | --- | --- |
| trie-dp (spec-faithful) | 1.82 | 3.15 | 3.91 | 5.57 | 530 |
| trie-dp-flat | 0.819 | 1.43 | 1.79 | 2.44 | 1,171 |

The 250 queries/s peak load in the milestone is the throughput to compare against the last column.

## Claim 5 - Heap memory and insertion cost

Milestone: "For K = 5,000, memory footprint is under 400 KB"; "a random insertion into a binary heap sifts up only 1.6 levels" on average.

| Measure | Value |
| --- | --- |
| Heap + 5,000 reservation records, retained | 551 KB (claim: < 400 KB) |
| Mean sift-up swaps per insert, all Students (pure FIFO) | 0.000 |
| Mean sift-up swaps per insert, 70/15/10/5 role mix | 0.584 (claim: ~1.6) |
| Mean sift-up swaps per insert, roles uniform over the four tiers | 0.717 |

With arrival times strictly increasing and a single role, no insert ever sifts up, because every new score is larger than all existing scores. Sift-up only happens when a higher-weight role arrives after lower-weight ones.
