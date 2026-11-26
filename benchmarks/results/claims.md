# Verification of the design document's claims

Generated 2026-11-26T12:25:59.705Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70.
Synthetic data (src/data/catalog.ts and the sample catalog of apps/api/src/seed/catalog-generator.ts): figures that depend on the character distribution (pruning, branching) must be re-checked on the real UMak catalog. Latencies are medians across 5 trials with shuffled query order, IQR in brackets.

## Claim 1 - Trie memory

First version: "approximately 18.5 MB" for 50,000 titles x 4 tokens x 6 characters, node count about 0.35 x (N x L_avg). Revised: the shipped flat trie (32-bit typed arrays) needs a few MB for 50,000 distinct tokens and grows in step with its node count (Claim 3 lists it up to 200,000 tokens); a pointer trie with Map children needs over ten times more.

| Measure | Value |
| --- | --- |
| Lexicon | 50,000 unique synthetic tokens, mean length 9.4 characters (first version assumed 6) |
| Trie nodes | 255,689 |
| Nodes / (N x L_avg) | 0.545 (first version: ~0.35) |
| Mean fan-out of internal nodes | 1.21 |
| Retained memory, shipped flat trie (libras-flat-trie) | 3.4 MB |
| Retained memory, Map-based pointer trie (trie-dp) | 55.0 MB (x16.1) |

## Claim 2 - Node visits and pruning

First version: "~40 node visits" for m = 12 at k = 2 and "98.4% of branches pruned". Revised: a query visits thousands of nodes at k = 2 (the edit ball around every prefix of the query, Section 3.1), which is still a small fraction of the trie.

| Query length m | k | Nodes visited / query | Of which pruned (row min > k) | Trie nodes never visited | Matches / query |
| --- | --- | --- | --- | --- | --- |
| 6 | 1 | 947 | 821 | 99.63% | 1.0 |
| 6 | 2 | 7,919 | 6,183 | 96.90% | 13.9 |
| 12 | 1 | 1,036 | 889 | 99.59% | 0.4 |
| 12 | 2 | 8,401 | 6,462 | 96.71% | 0.9 |
| 16 | 1 | 1,030 | 877 | 99.60% | 0.4 |
| 16 | 2 | 8,456 | 6,495 | 96.69% | 0.8 |

## Claim 3 - Search cost grows with the catalog, below the worst-case ceiling

First version: worst-case time "strictly independent of the database lexicon size N". Revised: the O(m^(k+1) |Sigma|^(k+1)) bound does not mention N and caps the work for any N, but below that cap the visited nodes grow with N, because a larger lexicon fills more of the edit ball. Measured at m = 12, k = 2 with the shipped code:

| N (tokens) | Trie nodes | Nodes visited / query | p50 (ms) | p95 (ms) | Shipped trie memory (MB) |
| --- | --- | --- | --- | --- | --- |
| 5,000 | 27,511 | 2,708 | 0.307 (IQR 0.002) | 0.498 (IQR 0.015) | 1.0 |
| 20,000 | 102,696 | 5,517 | 0.814 (IQR 0.372) | 1.22 (IQR 0.193) | 1.4 |
| 50,000 | 255,689 | 8,152 | 0.972 (IQR 0.053) | 1.53 (IQR 0.301) | 3.4 |
| 100,000 | 507,341 | 11,613 | 1.43 (IQR 0.051) | 2.13 (IQR 0.410) | 6.8 |
| 200,000 | 987,066 | 15,083 | 1.91 (IQR 0.281) | 3.19 (IQR 0.964) | 13.2 |

## Claim 4 - Latency and throughput at the target scale

Requirement: answer within 1.0 s at 50 concurrent users and sustain 250 queries/s (SRS). Algorithm only (no network or database), single thread, shipped code, k = 2, mixed query lengths:

| Lexicon | p50 (ms) | p95 (ms) | queries/s (1 thread) |
| --- | --- | --- | --- |
| 50,000 tokens | 0.877 (IQR 0.033) | 1.70 (IQR 0.161) | 1,076 |
| 200,000 tokens (50,000 titles x 4 distinct tokens) | 1.65 (IQR 0.082) | 2.97 (IQR 0.506) | 578 |

## Claim 5 - The shipped catalog search, end to end

The API answers a catalog query with `buildCatalogIndex(...).search(query)` (packages/shared/src/search/catalog-index.ts): every query word must match a word of the Book within its typo bound (0 typos for words of 1 to 3 letters, 1 for 4 to 6, 2 for 7 or more; words with a digit match exactly), and the Books are ranked by the summed distance. Here it runs over the sample catalog the seed script loads (apps/api/src/seed/catalog-generator.ts). Each query takes 1 to 3 words of a random Book's title or author surname and applies one typo of the given kind to one word of 4 or more letters. Recall = share of queries whose intended Book is among the hits.

Sample catalog: 45,460 Books, 50,000 distinct title and author words, 86,679 Copies. Index build 812 ms, retained 22.4 MB.

| Typo in one word | Recall (any rank) | Intended Book in first 20 hits | Typo word of 4-6 letters | Typo word of 7+ letters |
| --- | --- | --- | --- | --- |
| no typo | 100.0% | 71.3% | 100.0% of 94 | 100.0% of 306 |
| one substitution | 100.0% | 64.8% | 100.0% of 91 | 100.0% of 309 |
| one deletion | 97.8% | 65.0% | 90.6% of 96 | 100.0% of 304 |
| one insertion | 100.0% | 65.5% | 100.0% of 79 | 100.0% of 321 |
| one transposition | 79.3% | 50.5% | 3.5% of 86 | 100.0% of 314 |

Whole catalog search over these 2,000 queries: p50 1.61 (IQR 0.010) ms, p95 3.63 (IQR 0.262) ms, 581 queries/s on one thread.

Two gaps of the shipped policy show here, and both come from the typo bound, not from the trie. (1) The distance is plain Levenshtein, in which swapping two adjacent letters costs 2: a word of 4 to 6 letters may carry only 1 typo, so a transposition in such a word is not found, and in a longer word it uses the whole budget of 2. (2) The bound is chosen from the length of the word as typed: deleting a letter from a 4-letter word leaves 3 letters, which must match exactly. The planned remedies are optimal string alignment distance (a transposition costs 1) and a bound taken from the longer of the typed word and the candidate word (design document, Section 6.2). The first-20 column is lower than recall because a one-word query on a common word matches many Books at the same distance, which keep catalog order.

## Claim 6 - Dispatcher memory and insertion cost

First version: "For K = 5,000, memory footprint is under 400 KB"; "a random insertion sifts up only 1.6 levels". Revised: arrival times only increase, so an insert sifts up only when a higher-weight role arrives after lower-weight ones; the mean is well under one level.

| Measure | Value |
| --- | --- |
| Indexed heap + 5,000 reservation records, retained | 775 KB (first version: < 400 KB) |
| Mean sift-up swaps per insert, all Students (pure FIFO) | 0.000 |
| Mean sift-up swaps per insert, 70/15/10/5 role mix | 0.584 (first version: ~1.6) |
| Mean sift-up swaps per insert, roles uniform over the four tiers | 0.717 |
