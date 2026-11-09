# Fuzzy search decision matrix

Computed from results/search.json (2026-11-09T18:35:05.506Z). Inputs: words lexicon, N = 50,000, k = 2. Method is documented at the top of src/decision-matrix.ts.

## Inputs and gate

| Candidate | p95 latency (ms) | Queries/s (1 thread) | Retained (MB) | Impl. LOC | Passes gate? |
| --- | --- | --- | --- | --- | --- |
| trie-dp | 2.93 | 553 | 55.3 | 63 | yes |
| trie-dp-flat | 1.93 | 937 | 4.4 | 95 | yes |
| linear-scan | 13.50 | 113 | 0.1 | 16 | NO |
| bk-tree | 26.21 | 55 | 11.0 | 41 | NO |
| symspell | 0.19 | 15,139 | 318.0 | 56 | yes |
| ngram-bigram | 1.97 | 823 | 5.6 | 77 | yes |

Gate: zero result mismatches and at least 250 queries/s on one thread (the SRS peak load).

## Scores (0-100, higher is better)

| Candidate | Latency | Simplicity | Memory | Latency-first (agreed default) | Balanced | Memory-lean (small server instance) |
| --- | --- | --- | --- | --- | --- | --- |
| trie-dp | 0 | 82 | 41 | 26.6 | 36.9 | 41.0 |
| trie-dp-flat | 15 | 0 | 100 | 24.2 | 36.2 | 53.9 |
| symspell | 100 | 100 | 0 | 85.0 | 70.0 | 50.0 |
| ngram-bigram | 15 | 46 | 94 | 34.4 | 48.0 | 62.4 |

## Ranking among candidates that pass the gate

- **Latency-first (agreed default)** (latency 60% / simplicity 25% / memory 15%): symspell (85.0) > ngram-bigram (34.4) > trie-dp (26.6) > trie-dp-flat (24.2)
- **Balanced** (latency 40% / simplicity 30% / memory 30%): symspell (70.0) > ngram-bigram (48.0) > trie-dp (36.9) > trie-dp-flat (36.2)
- **Memory-lean (small server instance)** (latency 25% / simplicity 25% / memory 50%): ngram-bigram (62.4) > trie-dp-flat (53.9) > symspell (50.0) > trie-dp (41.0)

Note: scores are relative to the other passing candidates, not absolute. Every passing candidate is far inside the 1.0 s SLA, so a low latency score does not mean slow in practice; read the ranking together with the absolute numbers above.
