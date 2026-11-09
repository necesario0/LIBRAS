# Fuzzy search decision

Computed from results/search.json (2026-11-09T18:35:05.506Z). Words lexicon, N = 50,000, k = 2. The rule is documented at the top of src/decision-matrix.ts.

| Candidate | p95 (ms) | p99 (ms) | Queries/s | Retained (MB) | Exact? | Throughput gate (250/s) | Memory gate (<= 8.8 MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| trie-dp | 2.93 | 3.99 | 553 | 55.3 | yes | yes | NO |
| trie-dp-flat | 1.93 | 2.32 | 937 | 4.4 | yes | yes | yes |
| linear-scan | 13.50 | 16.30 | 113 | 0.1 | yes | NO | yes |
| bk-tree | 26.21 | 30.17 | 55 | 11.0 | yes | NO | NO |
| symspell | 0.19 | 0.24 | 15,139 | 318.0 | yes | yes | NO |
| ngram-bigram | 1.97 | 4.24 | 823 | 5.6 | yes | yes | yes |

## Ranking among candidates passing every gate (lowest p95; within 5% is a tie, broken by p99)

1. **trie-dp-flat**: p95 1.93 ms, p99 2.32 ms, 4.4 MB
2. **ngram-bigram**: p95 1.97 ms, p99 4.24 ms, 5.6 MB

Fastest exact candidate ignoring memory: **symspell** (p95 0.19 ms, 318 MB), excluded by the memory gate if shown as NO above.
