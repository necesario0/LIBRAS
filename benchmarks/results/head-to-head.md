# Head-to-head: flattened trie vs bigram index

Generated 2026-11-09T19:09:19.277Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, Node v24.16.0. Synthetic words lexicon; 3,000 queries per run, 5 runs with alternating order; values are the mean of per-run percentiles.

| N (tokens) | k | Candidate | p50 (ms) | p95 (ms) | p99 (ms) | Retained (MB) |
| --- | --- | --- | --- | --- | --- | --- |
| 20,000 | 1 | trie-dp-flat | 0.042 | 0.082 | 0.109 | 1.8 |
| 20,000 | 1 | ngram-bigram | 0.170 | 0.309 | 0.396 | 2.2 |
| 20,000 | 2 | trie-dp-flat | 0.269 | 0.507 | 0.668 | 1.8 |
| 20,000 | 2 | ngram-bigram | 0.229 | 0.397 | 0.537 | 2.2 |
| 50,000 | 1 | trie-dp-flat | 0.055 | 0.109 | 0.145 | 4.4 |
| 50,000 | 1 | ngram-bigram | 0.524 | 0.989 | 1.35 | 5.6 |
| 50,000 | 2 | trie-dp-flat | 0.417 | 0.729 | 0.948 | 4.4 |
| 50,000 | 2 | ngram-bigram | 0.686 | 1.25 | 2.53 | 5.6 |
| 100,000 | 1 | trie-dp-flat | 0.069 | 0.135 | 0.178 | 8.7 |
| 100,000 | 1 | ngram-bigram | 1.22 | 2.39 | 6.71 | 11.1 |
| 100,000 | 2 | trie-dp-flat | 0.620 | 1.13 | 1.47 | 8.7 |
| 100,000 | 2 | ngram-bigram | 1.97 | 4.25 | 6.59 | 11.1 |
| 200,000 | 1 | trie-dp-flat | 0.093 | 0.185 | 0.237 | 16.9 |
| 200,000 | 1 | ngram-bigram | 3.78 | 8.17 | 12.22 | 22.6 |
| 200,000 | 2 | trie-dp-flat | 0.836 | 1.53 | 1.97 | 16.9 |
| 200,000 | 2 | ngram-bigram | 4.48 | 8.05 | 10.00 | 22.6 |
| 400,000 | 1 | trie-dp-flat | 0.112 | 0.206 | 0.261 | 32.6 |
| 400,000 | 1 | ngram-bigram | 11.91 | 20.06 | 24.39 | 46.3 |
| 400,000 | 2 | trie-dp-flat | 1.32 | 2.44 | 3.18 | 32.6 |
| 400,000 | 2 | ngram-bigram | 13.02 | 21.60 | 27.90 | 46.3 |
