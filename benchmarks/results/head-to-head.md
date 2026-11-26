# Head-to-head: flattened trie (shipped and prototype) vs bigram index

Generated 2026-11-26T12:03:57.868Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70. Synthetic words lexicon; 3,000 queries per run, 5 runs with a rotating candidate order; values are the median of per-run percentiles in ms, with the IQR across runs.

| N (tokens) | k | Candidate | p50 (ms) | p95 (ms) | p99 (ms) | Retained (MB) |
| --- | --- | --- | --- | --- | --- | --- |
| 20,000 | 1 | libras-flat-trie | 0.076 (IQR 0.004) | 0.153 (IQR 0.026) | 0.208 (IQR 0.056) | 1.4 |
| 20,000 | 1 | trie-dp-flat | 0.077 (IQR 0.006) | 0.164 (IQR 0.028) | 0.216 (IQR 0.043) | 1.8 |
| 20,000 | 1 | ngram-bigram | 0.322 (IQR 0.010) | 0.584 (IQR 0.027) | 0.759 (IQR 0.038) | 2.2 |
| 20,000 | 2 | libras-flat-trie | 0.521 (IQR 0.006) | 0.974 (IQR 0.018) | 1.27 (IQR 0.069) | 1.4 |
| 20,000 | 2 | trie-dp-flat | 0.504 (IQR 0.040) | 0.889 (IQR 0.215) | 1.08 (IQR 0.343) | 1.8 |
| 20,000 | 2 | ngram-bigram | 0.449 (IQR 0.030) | 0.797 (IQR 0.045) | 1.06 (IQR 0.174) | 2.2 |
| 50,000 | 1 | libras-flat-trie | 0.102 (IQR 0.002) | 0.201 (IQR 0.003) | 0.276 (IQR 0.011) | 3.4 |
| 50,000 | 1 | trie-dp-flat | 0.104 (IQR 0.013) | 0.210 (IQR 0.054) | 0.277 (IQR 0.067) | 4.4 |
| 50,000 | 1 | ngram-bigram | 1.01 (IQR 0.004) | 1.83 (IQR 0.046) | 2.22 (IQR 0.049) | 5.6 |
| 50,000 | 2 | libras-flat-trie | 0.839 (IQR 0.009) | 1.56 (IQR 0.089) | 2.04 (IQR 0.113) | 3.4 |
| 50,000 | 2 | trie-dp-flat | 0.859 (IQR 0.036) | 1.64 (IQR 0.194) | 2.13 (IQR 0.231) | 4.4 |
| 50,000 | 2 | ngram-bigram | 1.27 (IQR 0.029) | 2.20 (IQR 0.106) | 3.88 (IQR 0.070) | 5.6 |
| 100,000 | 1 | libras-flat-trie | 0.127 (IQR 0.001) | 0.244 (IQR 0.001) | 0.319 (IQR 0.021) | 6.8 |
| 100,000 | 1 | trie-dp-flat | 0.145 (IQR 0.009) | 0.309 (IQR 0.023) | 0.401 (IQR 0.023) | 8.7 |
| 100,000 | 1 | ngram-bigram | 2.33 (IQR 0.013) | 4.18 (IQR 0.041) | 11.36 (IQR 0.562) | 11.1 |
| 100,000 | 2 | libras-flat-trie | 1.15 (IQR 0.005) | 2.05 (IQR 0.019) | 2.67 (IQR 0.062) | 6.8 |
| 100,000 | 2 | trie-dp-flat | 1.18 (IQR 0.006) | 2.17 (IQR 0.045) | 2.82 (IQR 0.227) | 8.7 |
| 100,000 | 2 | ngram-bigram | 2.87 (IQR 0.004) | 5.21 (IQR 0.067) | 7.87 (IQR 0.118) | 11.1 |
| 200,000 | 1 | libras-flat-trie | 0.165 (IQR 0.027) | 0.323 (IQR 0.082) | 0.418 (IQR 0.093) | 13.2 |
| 200,000 | 1 | trie-dp-flat | 0.157 (IQR 0.023) | 0.323 (IQR 0.074) | 0.414 (IQR 0.068) | 16.9 |
| 200,000 | 1 | ngram-bigram | 6.42 (IQR 0.154) | 11.76 (IQR 0.550) | 16.97 (IQR 0.762) | 22.6 |
| 200,000 | 2 | libras-flat-trie | 1.58 (IQR 0.019) | 2.80 (IQR 0.160) | 3.56 (IQR 0.246) | 13.2 |
| 200,000 | 2 | trie-dp-flat | 1.60 (IQR 0.061) | 2.90 (IQR 0.117) | 3.77 (IQR 0.083) | 16.9 |
| 200,000 | 2 | ngram-bigram | 7.73 (IQR 0.027) | 12.77 (IQR 0.236) | 15.42 (IQR 0.103) | 22.6 |
| 400,000 | 1 | libras-flat-trie | 0.191 (IQR 0.007) | 0.367 (IQR 0.017) | 0.475 (IQR 0.024) | 25.3 |
| 400,000 | 1 | trie-dp-flat | 0.192 (IQR 0.010) | 0.373 (IQR 0.043) | 0.501 (IQR 0.067) | 32.6 |
| 400,000 | 1 | ngram-bigram | 16.39 (IQR 0.045) | 26.17 (IQR 0.052) | 31.02 (IQR 0.479) | 46.3 |
| 400,000 | 2 | libras-flat-trie | 2.21 (IQR 0.039) | 4.08 (IQR 0.226) | 5.32 (IQR 0.100) | 25.3 |
| 400,000 | 2 | trie-dp-flat | 2.24 (IQR 0.071) | 4.04 (IQR 0.262) | 5.25 (IQR 0.586) | 32.6 |
| 400,000 | 2 | ngram-bigram | 18.96 (IQR 0.049) | 28.42 (IQR 0.486) | 32.39 (IQR 0.929) | 46.3 |
