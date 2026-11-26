# Worst-case node counts, exhaustive dictionary, k = 2

Generated 2026-11-26T12:23:48.441Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70. Node counts are deterministic: they depend only on sigma, m and k, not on the machine.

Expanded = nodes whose children are explored (row minimum <= k); bound O(m^3 sigma^2). Visited = nodes whose DP row is computed, one per edge probe; bound O(m^3 sigma^3). The slope is the log-log growth of expanded nodes between consecutive m; it should approach k + 1 = 3 from below as m grows (it is lower for small m because the edit balls of short prefixes overlap and are clipped at length 0).

### Alphabet size 2

| m | Expanded | Visited | Visited / expanded (<= sigma) | Expanded / (m^3 sigma^2) | Visited / (m^3 sigma^3) | Slope of expanded vs m |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | 194 | 388 | 2.00 | 0.225 | 0.225 | - |
| 10 | 746 | 1,492 | 2.00 | 0.186 | 0.186 | 2.64 |
| 14 | 1,938 | 3,876 | 2.00 | 0.177 | 0.177 | 2.84 |
| 18 | 4,026 | 8,052 | 2.00 | 0.173 | 0.173 | 2.91 |
| 22 | 7,266 | 14,532 | 2.00 | 0.171 | 0.171 | 2.94 |
| 28 | 14,846 | 29,692 | 2.00 | 0.169 | 0.169 | 2.96 |
| 34 | 26,458 | 52,916 | 2.00 | 0.168 | 0.168 | 2.98 |
| 40 | 42,966 | 85,932 | 2.00 | 0.168 | 0.168 | 2.98 |

### Alphabet size 3

| m | Expanded | Visited | Visited / expanded (<= sigma) | Expanded / (m^3 sigma^2) | Visited / (m^3 sigma^3) | Slope of expanded vs m |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 278 | 834 | 3.00 | 0.483 | 0.483 | - |
| 6 | 803 | 2,409 | 3.00 | 0.413 | 0.413 | 2.62 |
| 8 | 1,840 | 5,520 | 3.00 | 0.399 | 0.399 | 2.88 |
| 10 | 3,589 | 10,767 | 3.00 | 0.399 | 0.399 | 2.99 |
| 12 | 6,250 | 18,750 | 3.00 | 0.402 | 0.402 | 3.04 |
| 16 | 15,108 | 45,324 | 3.00 | 0.410 | 0.410 | 3.07 |
| 20 | 30,014 | 90,042 | 3.00 | 0.417 | 0.417 | 3.08 |

### Alphabet size 4

| m | Expanded | Visited | Visited / expanded (<= sigma) | Expanded / (m^3 sigma^2) | Visited / (m^3 sigma^3) | Slope of expanded vs m |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 597 | 2,388 | 4.00 | 0.583 | 0.583 | - |
| 6 | 1,765 | 7,060 | 4.00 | 0.511 | 0.511 | 2.67 |
| 8 | 4,033 | 16,132 | 4.00 | 0.492 | 0.492 | 2.87 |
| 10 | 7,793 | 31,172 | 4.00 | 0.487 | 0.487 | 2.95 |
| 12 | 13,437 | 53,748 | 4.00 | 0.486 | 0.486 | 2.99 |
| 14 | 21,357 | 85,428 | 4.00 | 0.486 | 0.486 | 3.01 |
| 16 | 31,945 | 127,780 | 4.00 | 0.487 | 0.487 | 3.02 |

### Summary at the largest m of each alphabet

| sigma | m | Expanded / (m^3 sigma^2) | Visited / (m^3 sigma^3) | Last slope |
| --- | --- | --- | --- | --- |
| 2 | 40 | 0.168 | 0.168 | 2.98 |
| 3 | 20 | 0.417 | 0.417 | 3.08 |
| 4 | 16 | 0.487 | 0.487 | 3.02 |

Reading: visited / expanded is exactly sigma here, because every child of an expanded node exists in an exhaustive dictionary, so the two bounds differ by exactly one factor of sigma. For each alphabet the normalised ratio levels off as m grows and the slope settles near 3, as O(m^3) predicts. Across alphabets the ratio rises with sigma (0.17, 0.42, 0.49) but stays below 1: each of the k edits chooses one of at most sigma letters, so the edit ball holds at most a polynomial in m times sigma^k strings, and substitutions only have sigma - 1 choices, which is why small alphabets sit further below the limit. On a real lexicon most branches are absent, so the measured counts (claims.md, Claim 2) are far below these ceilings.
