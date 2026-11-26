# Fuzzy search decision

Computed from results/search.json (2026-11-26T11:42:24.392Z, benchmark code at commit 97d046449d70). Words lexicon, N = 50,000, k = 2, median across 5 trials. The rule is documented at the top of src/decision-matrix.ts.

| Candidate | p95 (ms) | p95 IQR (ms) | p99 (ms) | Queries/s | Retained (MB) | Exact? | Throughput gate (250/s) | Memory gate (<= 6.8 MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| libras-flat-trie | 1.40 | 0.128 | 1.71 | 1,188 | 3.4 | yes | yes | yes |
| trie-dp-flat | 1.69 | 0.365 | 2.13 | 1,055 | 4.4 | yes | yes | yes |
| trie-dp | 2.92 | 0.169 | 3.66 | 597 | 55.3 | yes | yes | NO |
| linear-scan | 14.24 | 1.528 | 16.56 | 113 | 0.1 | yes | NO | yes |
| bk-tree | 27.33 | 0.763 | 31.79 | 53 | 11.0 | yes | NO | NO |
| symspell | 0.28 | 0.064 | 0.39 | 11,432 | 318.1 | yes | yes | NO |
| ngram-bigram | 2.22 | 0.128 | 4.43 | 749 | 5.6 | yes | yes | yes |

## Ranking among candidates passing every gate (lowest p95; within 5% is a tie, broken by p99)

1. **libras-flat-trie**: p95 1.40 ms (IQR 0.128), p99 1.71 ms, 3.4 MB
2. **trie-dp-flat**: p95 1.69 ms (IQR 0.365), p99 2.13 ms, 4.4 MB
3. **ngram-bigram**: p95 2.22 ms (IQR 0.128), p99 4.43 ms, 5.6 MB

libras-flat-trie (the shipped code) and trie-dp-flat (its prototype) are the same algorithm and data layout, so they are expected to tie.

Fastest exact candidate ignoring memory: **symspell** (p95 0.28 ms, 318 MB), excluded by the memory gate if shown as NO above.
