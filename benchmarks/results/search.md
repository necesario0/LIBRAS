# Fuzzy search benchmark results

Generated 2026-11-26T11:42:24.392Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70.
Data is synthetic (see src/data/catalog.ts). Single-threaded, in-memory. 5 independent trials, each with a shuffled candidate order and a shuffled query order; figures are the median across trials with the interquartile range (IQR) across trials.
Bold = the chosen design: **libras-flat-trie** is the code LIBRAS ships (packages/shared/src/search/flat-trie.ts), **trie-dp-flat** its benchmark prototype. trie-dp is the same algorithm with Map-based nodes (the first milestone sketch).

### words lexicon, N = 50,000 tokens, 1500 queries (5% no-match, edits 0-2), 5 trials

Build time (median of 3 builds) and retained memory (heap + typed arrays after GC):

| Index | Build (ms) | Retained (MB) |
| --- | --- | --- |
| **libras-flat-trie** | 33 | 3.4 |
| **trie-dp-flat** | 230 | 4.4 |
| trie-dp | 33 | 55.3 |
| linear-scan | 0 | 0.0 |
| bk-tree | 320 | 11.0 |
| symspell | 2696 | 318.1 |
| ngram-bigram | 120 | 5.6 |

Query latency, k = 1, in ms: median across 5 trials of each trial's percentile, with the IQR across trials. Mismatches = queries whose result set differs from the linear-scan reference (checked on every query):

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.059 (IQR 0.048) | 0.118 (IQR 0.091) | 0.172 (IQR 0.093) | 0.271 | 15,833 | 0 |
| **trie-dp-flat** | 0.059 (IQR 0.007) | 0.126 (IQR 0.008) | 0.168 (IQR 0.009) | 0.257 | 15,306 | 0 |
| trie-dp | 0.114 (IQR 0.071) | 0.245 (IQR 0.135) | 0.331 (IQR 0.169) | 1.88 | 7,799 | 0 |
| linear-scan | 2.16 (IQR 0.129) | 3.02 (IQR 0.925) | 3.90 (IQR 1.64) | 5.08 | 486 | 0 |
| bk-tree | 1.47 (IQR 0.258) | 2.43 (IQR 0.538) | 3.01 (IQR 0.738) | 4.07 | 674 | 0 |
| symspell | 0.012 (IQR 0.005) | 0.049 (IQR 0.017) | 0.110 (IQR 0.052) | 0.226 | 56,922 | 0 |
| ngram-bigram | 0.548 (IQR 0.449) | 1.06 (IQR 0.758) | 1.68 (IQR 0.772) | 7.60 | 1,632 | 0 |

Query latency, k = 2, in ms: median across 5 trials of each trial's percentile, with the IQR across trials. Mismatches = queries whose result set differs from the linear-scan reference (checked on every query):

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.807 (IQR 0.020) | 1.40 (IQR 0.128) | 1.71 (IQR 0.309) | 2.73 | 1,188 | 0 |
| **trie-dp-flat** | 0.882 (IQR 0.095) | 1.69 (IQR 0.365) | 2.13 (IQR 0.360) | 3.01 | 1,055 | 0 |
| trie-dp | 1.59 (IQR 0.014) | 2.92 (IQR 0.169) | 3.66 (IQR 0.060) | 5.25 | 597 | 0 |
| linear-scan | 9.38 (IQR 0.322) | 14.24 (IQR 1.53) | 16.56 (IQR 0.191) | 18.69 | 113 | 0 |
| bk-tree | 18.98 (IQR 0.149) | 27.33 (IQR 0.763) | 31.79 (IQR 0.011) | 35.52 | 53 | 0 |
| symspell | 0.056 (IQR 0.007) | 0.278 (IQR 0.064) | 0.395 (IQR 0.062) | 0.506 | 11,432 | 0 |
| ngram-bigram | 1.26 (IQR 0.022) | 2.22 (IQR 0.128) | 4.43 (IQR 0.074) | 6.17 | 749 | 0 |

k = 2 p95 latency (ms) by query length, median across 5 trials:

| Index | short(3-6) | medium(7-12) | long(13+) |
| --- | --- | --- | --- |
| **libras-flat-trie** | 0.806 (IQR 0.138) | 1.34 (IQR 0.177) | 1.68 (IQR 0.298) |
| **trie-dp-flat** | 1.09 (IQR 0.235) | 1.63 (IQR 0.358) | 2.15 (IQR 0.469) |
| trie-dp | 1.90 (IQR 0.087) | 2.62 (IQR 0.117) | 3.61 (IQR 0.214) |
| linear-scan | 9.42 (IQR 1.21) | 15.36 (IQR 0.860) | 12.76 (IQR 1.38) |
| bk-tree | 23.35 (IQR 0.320) | 28.55 (IQR 0.913) | 20.36 (IQR 0.976) |
| symspell | 0.329 (IQR 0.061) | 0.092 (IQR 0.011) | 0.366 (IQR 0.047) |
| ngram-bigram | 1.59 (IQR 0.214) | 2.13 (IQR 0.066) | 2.55 (IQR 0.075) |

### callnos lexicon, N = 20,000 tokens, 1500 queries (5% no-match, edits 0-2), 5 trials

Build time (median of 3 builds) and retained memory (heap + typed arrays after GC):

| Index | Build (ms) | Retained (MB) |
| --- | --- | --- |
| **libras-flat-trie** | 12 | 0.8 |
| **trie-dp-flat** | 67 | 1.0 |
| trie-dp | 20 | 12.6 |
| linear-scan | 0 | 0.0 |
| bk-tree | 141 | 4.3 |
| symspell | 626 | 56.7 |
| ngram-bigram | 53 | 1.8 |

Query latency, k = 1, in ms: median across 5 trials of each trial's percentile, with the IQR across trials. Mismatches = queries whose result set differs from the linear-scan reference (checked on every query):

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.095 (IQR 0.000) | 0.254 (IQR 0.003) | 0.330 (IQR 0.002) | 0.473 | 8,835 | 0 |
| **trie-dp-flat** | 0.095 (IQR 0.001) | 0.257 (IQR 0.010) | 0.340 (IQR 0.017) | 0.433 | 8,681 | 0 |
| trie-dp | 0.170 (IQR 0.007) | 0.494 (IQR 0.099) | 0.723 (IQR 0.043) | 1.74 | 4,637 | 0 |
| linear-scan | 1.83 (IQR 0.045) | 4.50 (IQR 0.165) | 6.90 (IQR 0.257) | 7.94 | 447 | 0 |
| bk-tree | 0.483 (IQR 0.033) | 1.86 (IQR 0.102) | 2.27 (IQR 0.452) | 2.91 | 1,540 | 0 |
| symspell | 0.013 (IQR 0.000) | 0.064 (IQR 0.005) | 0.107 (IQR 0.007) | 0.203 | 46,408 | 0 |
| ngram-bigram | 0.252 (IQR 0.004) | 0.481 (IQR 0.023) | 0.610 (IQR 0.036) | 1.68 | 3,790 | 0 |

Query latency, k = 2, in ms: median across 5 trials of each trial's percentile, with the IQR across trials. Mismatches = queries whose result set differs from the linear-scan reference (checked on every query):

| Index | p50 | p95 | p99 | max | queries/s (1 thread) | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.543 (IQR 0.016) | 1.30 (IQR 0.028) | 1.53 (IQR 0.126) | 2.27 | 1,614 | 0 |
| **trie-dp-flat** | 0.543 (IQR 0.010) | 1.34 (IQR 0.069) | 1.67 (IQR 0.307) | 2.33 | 1,580 | 0 |
| trie-dp | 1.02 (IQR 0.007) | 2.73 (IQR 0.096) | 3.84 (IQR 0.092) | 5.65 | 802 | 0 |
| linear-scan | 3.67 (IQR 0.025) | 6.12 (IQR 0.472) | 8.56 (IQR 0.207) | 9.13 | 266 | 0 |
| bk-tree | 2.95 (IQR 0.093) | 7.74 (IQR 0.270) | 10.88 (IQR 0.488) | 13.44 | 293 | 0 |
| symspell | 0.090 (IQR 0.003) | 0.262 (IQR 0.013) | 0.352 (IQR 0.011) | 5.35 | 8,396 | 0 |
| ngram-bigram | 0.397 (IQR 0.022) | 1.42 (IQR 0.085) | 2.46 (IQR 0.139) | 4.64 | 1,979 | 0 |

k = 2 p95 latency (ms) by query length, median across 5 trials:

| Index | short(3-6) | medium(7-12) | long(13+) |
| --- | --- | --- | --- |
| **libras-flat-trie** | 0.670 (IQR 0.057) | 1.21 (IQR 0.019) | 1.54 (IQR 0.114) |
| **trie-dp-flat** | 0.701 (IQR 0.064) | 1.23 (IQR 0.102) | 1.64 (IQR 0.345) |
| trie-dp | 1.54 (IQR 0.043) | 2.41 (IQR 0.069) | 3.84 (IQR 0.146) |
| linear-scan | 5.60 (IQR 0.346) | 5.49 (IQR 0.058) | 8.49 (IQR 0.249) |
| bk-tree | 4.62 (IQR 0.513) | 7.04 (IQR 0.302) | 10.73 (IQR 1.21) |
| symspell | 0.289 (IQR 0.020) | 0.080 (IQR 0.003) | 0.158 (IQR 0.009) |
| ngram-bigram | 1.51 (IQR 0.436) | 0.590 (IQR 0.070) | 0.714 (IQR 0.010) |

### Scaling with lexicon size

p50 latency (ms, k = 2), median across 5 trials with IQR:

| Index | 5,000 | 20,000 | 50,000 | 100,000 | 200,000 |
| --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.258 (IQR 0.008) | 0.652 (IQR 0.198) | 0.827 (IQR 0.019) | 1.16 (IQR 0.019) | 1.67 (IQR 0.219) |
| **trie-dp-flat** | 0.254 (IQR 0.002) | 0.551 (IQR 0.304) | 0.833 (IQR 0.212) | 1.25 (IQR 0.058) | 1.62 (IQR 0.016) |
| trie-dp | 0.443 (IQR 0.008) | 0.936 (IQR 0.028) | 1.77 (IQR 0.232) | 2.49 (IQR 0.078) | 3.75 (IQR 0.316) |
| linear-scan | 0.783 (IQR 0.012) | 3.39 (IQR 0.025) | 9.67 (IQR 0.778) | 19.33 (IQR 0.391) | 40.84 (IQR 1.70) |
| bk-tree | 1.81 (IQR 0.034) | 7.09 (IQR 0.369) | 18.60 (IQR 0.157) | 37.66 (IQR 0.511) | 77.99 (IQR 0.739) |
| symspell | 0.040 (IQR 0.018) | 0.057 (IQR 0.012) | 0.067 (IQR 0.005) | 0.093 (IQR 0.011) | skipped |
| ngram-bigram | 0.104 (IQR 0.003) | 0.435 (IQR 0.012) | 1.33 (IQR 0.042) | 3.00 (IQR 0.036) | 8.13 (IQR 0.370) |

p95 latency (ms, k = 2), median across 5 trials with IQR:

| Index | 5,000 | 20,000 | 50,000 | 100,000 | 200,000 |
| --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.452 (IQR 0.086) | 1.24 (IQR 0.467) | 1.37 (IQR 0.084) | 1.85 (IQR 0.162) | 3.04 (IQR 0.791) |
| **trie-dp-flat** | 0.438 (IQR 0.008) | 0.968 (IQR 0.440) | 1.36 (IQR 0.591) | 2.39 (IQR 0.435) | 2.78 (IQR 0.251) |
| trie-dp | 0.857 (IQR 0.046) | 1.68 (IQR 0.075) | 3.22 (IQR 0.579) | 4.74 (IQR 0.437) | 6.15 (IQR 1.11) |
| linear-scan | 1.03 (IQR 0.033) | 5.26 (IQR 1.10) | 15.27 (IQR 4.56) | 26.61 (IQR 5.24) | 59.92 (IQR 5.30) |
| bk-tree | 2.54 (IQR 0.179) | 11.16 (IQR 1.62) | 25.94 (IQR 0.847) | 52.71 (IQR 0.878) | 104 (IQR 0.687) |
| symspell | 0.205 (IQR 0.055) | 0.261 (IQR 0.073) | 0.321 (IQR 0.033) | 0.385 (IQR 0.028) | skipped |
| ngram-bigram | 0.200 (IQR 0.005) | 0.734 (IQR 0.001) | 2.21 (IQR 0.006) | 5.08 (IQR 0.335) | 12.63 (IQR 0.977) |

Retained memory (MB):

| Index | 5,000 | 20,000 | 50,000 | 100,000 | 200,000 |
| --- | --- | --- | --- | --- | --- |
| **libras-flat-trie** | 0.4 | 1.4 | 3.4 | 6.8 | 13.2 |
| **trie-dp-flat** | 0.5 | 1.8 | 4.4 | 4.3 | 16.9 |
| trie-dp | 6.0 | 22.2 | 55.3 | 109.8 | 213.3 |
| linear-scan | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| bk-tree | 1.1 | 4.4 | 11.0 | 22.0 | 43.9 |
| symspell | 26.9 | 105.4 | 318.1 | 653.4 | skipped |
| ngram-bigram | 0.6 | 2.2 | 5.6 | 11.1 | 22.6 |

Skipped:

- symspell at N = 200,000: projected 1,307 MB > 1,024 MB budget (bytes per token measured at the largest size it was built at).
