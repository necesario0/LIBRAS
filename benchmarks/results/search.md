# Fuzzy search benchmark results

Generated 2026-11-09T18:35:05.506Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64.
Data is synthetic (see src/data/catalog.ts). Single-threaded, in-memory. Bold = the team's chosen design.

### words lexicon, N = 50,000 tokens, 1500 queries (5% no-match, edits 0-2)

Build time and retained memory (heap + typed arrays after GC):

| Index | Build (ms) | Retained (MB) |
| --- | --- | --- |
| **trie-dp** | 46 | 55.3 |
| trie-dp-flat | 235 | 4.4 |
| linear-scan | 0 | 0.0 |
| bk-tree | 280 | 11.0 |
| symspell | 3161 | 318.0 |
| ngram-bigram | 179 | 5.6 |

Query latency, k = 1 (ms; lower is better). Mismatches = queries whose result set differs from the linear-scan reference:

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **trie-dp** | 0.181 | 0.369 | 0.535 | 1.41 | 5,100 | 0 |
| trie-dp-flat | 0.097 | 0.183 | 0.255 | 0.579 | 9,756 | 0 |
| linear-scan | 4.24 | 7.10 | 8.19 | 10.06 | 235 | 0 |
| bk-tree | 2.43 | 4.05 | 4.78 | 6.03 | 405 | 0 |
| symspell | 0.012 | 0.041 | 0.089 | 0.188 | 60,871 | 0 |
| ngram-bigram | 0.977 | 1.75 | 2.22 | 10.74 | 969 | 0 |

Query latency, k = 2 (ms; lower is better). Mismatches = queries whose result set differs from the linear-scan reference:

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **trie-dp** | 1.74 | 2.93 | 3.99 | 6.76 | 553 | 0 |
| trie-dp-flat | 1.01 | 1.93 | 2.32 | 3.96 | 937 | 0 |
| linear-scan | 9.29 | 13.50 | 16.30 | 18.07 | 113 | 0 |
| bk-tree | 18.19 | 26.21 | 30.17 | 39.14 | 55 | 0 |
| symspell | 0.045 | 0.191 | 0.245 | 0.394 | 15,139 | 0 |
| ngram-bigram | 1.15 | 1.97 | 4.24 | 5.74 | 823 | 0 |

k = 2 p95 latency (ms) by query length:

| Index | short(3-6) | medium(7-12) | long(13+) |
| --- | --- | --- | --- |
| **trie-dp** | 1.97 | 2.74 | 4.17 |
| trie-dp-flat | 1.10 | 1.73 | 2.32 |
| linear-scan | 8.04 | 14.61 | 12.08 |
| bk-tree | 22.53 | 27.56 | 19.52 |
| symspell | 0.216 | 0.069 | 0.237 |
| ngram-bigram | 1.31 | 1.90 | 2.24 |

### callnos lexicon, N = 20,000 tokens, 1500 queries (5% no-match, edits 0-2)

Build time and retained memory (heap + typed arrays after GC):

| Index | Build (ms) | Retained (MB) |
| --- | --- | --- |
| **trie-dp** | 19 | 12.6 |
| trie-dp-flat | 85 | 1.0 |
| linear-scan | 0 | 0.0 |
| bk-tree | 133 | 4.3 |
| symspell | 573 | 56.7 |
| ngram-bigram | 53 | 1.8 |

Query latency, k = 1 (ms; lower is better). Mismatches = queries whose result set differs from the linear-scan reference:

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **trie-dp** | 0.153 | 0.422 | 0.533 | 1.42 | 5,389 | 0 |
| trie-dp-flat | 0.096 | 0.273 | 0.387 | 0.454 | 8,345 | 0 |
| linear-scan | 1.76 | 4.27 | 5.53 | 7.38 | 470 | 0 |
| bk-tree | 0.468 | 1.81 | 2.35 | 3.20 | 1,571 | 0 |
| symspell | 0.016 | 0.083 | 0.117 | 0.199 | 39,495 | 0 |
| ngram-bigram | 0.244 | 0.459 | 0.592 | 1.68 | 3,928 | 0 |

Query latency, k = 2 (ms; lower is better). Mismatches = queries whose result set differs from the linear-scan reference:

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **trie-dp** | 0.947 | 2.50 | 3.68 | 5.69 | 865 | 0 |
| trie-dp-flat | 0.521 | 1.25 | 1.41 | 1.90 | 1,686 | 0 |
| linear-scan | 3.51 | 5.42 | 7.66 | 9.38 | 281 | 0 |
| bk-tree | 2.81 | 7.44 | 9.87 | 11.93 | 302 | 0 |
| symspell | 0.085 | 0.245 | 0.323 | 4.48 | 8,916 | 0 |
| ngram-bigram | 0.372 | 1.36 | 2.47 | 5.50 | 2,043 | 0 |

k = 2 p95 latency (ms) by query length:

| Index | short(3-6) | medium(7-12) | long(13+) |
| --- | --- | --- | --- |
| **trie-dp** | 1.42 | 2.24 | 3.70 |
| trie-dp-flat | 0.628 | 1.15 | 1.41 |
| linear-scan | 4.75 | 5.13 | 7.17 |
| bk-tree | 4.65 | 6.77 | 9.87 |
| symspell | 0.265 | 0.071 | 0.137 |
| ngram-bigram | 1.49 | 0.521 | 0.668 |

### Scaling with lexicon size

| Index (p50 ms, k=2) | 5,000 | 20,000 | 50,000 | 100,000 | 200,000 |
| --- | --- | --- | --- | --- | --- |
| **trie-dp** | 0.450 | 0.914 | 1.78 | 1.43 | 2.02 |
| trie-dp-flat | 0.245 | 0.491 | 0.811 | 0.571 | 0.790 |
| linear-scan | 0.792 | 3.45 | 9.37 | 9.41 | 37.15 |
| bk-tree | 1.70 | 6.93 | 17.11 | 20.66 | 49.82 |
| symspell | 0.046 | 0.060 | 0.048 | 0.036 | skipped |
| ngram-bigram | 0.103 | 0.431 | 1.29 | 1.90 | 5.20 |
