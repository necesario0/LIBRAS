# Reservation dispatcher benchmark results

Generated 2026-11-09T18:38:59.300Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64. Bold = the team's chosen design.
Role mix: 70% Student, 15% Faculty, 10% NTP, 5% Visitor. Priority = arrival time minus role weight (milestone definition). All numbers are nanoseconds per operation; lower is better. "skipped" = quadratic and impractically slow at that size.

## A. Fill K reservations then drain them all (ns per operation, median of runs)

| Dispatcher | K=100 | K=1,000 | K=5,000 | K=50,000 |
| --- | --- | --- | --- | --- |
| **binary-heap** | 122 | 74.0 | 80.2 | 112 |
| binary-heap+index | 94.0 | 176 | 212 | 330 |
| 4-ary-heap+index | 457 | 159 | 173 | 281 |
| binary-heap+lazy-delete | 311 | 84.8 | 106 | 141 |
| pairing-heap+lazy-delete | 395 | 82.3 | 94.8 | 266 |
| sorted-array | 230 | 68.9 | 167 | 3206 |
| linear-scan | 231 | 530 | 2687 | skipped |

## B. Steady state: each step is one return (popMin) plus one new hold (push), queue stays ~K

Median (p50) and p99 per-operation cost, measured over batches of 500 operations.

| Dispatcher | K=100 p50 / p99 | K=1,000 p50 / p99 | K=5,000 p50 / p99 | K=50,000 p50 / p99 |
| --- | --- | --- | --- | --- |
| **binary-heap** | 34.2 / 93.0 | 66.8 / 120 | 88.8 / 203 | 114 / 237 |
| binary-heap+index | 119 / 151 | 172 / 243 | 217 / 503 | 387 / 676 |
| 4-ary-heap+index | 105 / 195 | 132 / 259 | 169 / 453 | 331 / 641 |
| binary-heap+lazy-delete | 43.8 / 110 | 57.0 / 101 | 101 / 352 | 662 / 1426 |
| pairing-heap+lazy-delete | 42.6 / 153 | 42.8 / 108 | 90.4 / 370 | 382 / 1960 |
| sorted-array | 27.0 / 76.2 | 32.4 / 71.6 | 208 / 314 | 6781 / 11095 |
| linear-scan | 111 / 238 | 1099 / 1407 | 6568 / 13746 | skipped |

## C. Churn with cancellations: 40% push, 40% popMin, 20% cancel/expire a random queued hold (ns per operation)

| Dispatcher | Fast cancel? | K=100 | K=1,000 | K=5,000 | K=50,000 |
| --- | --- | --- | --- | --- | --- |
| **binary-heap** | no (O(K)) | 47.7 | 34.4 | 123 | 7631 |
| binary-heap+index | yes | 61.5 | 77.5 | 102 | 409 |
| 4-ary-heap+index | yes | 60.0 | 69.8 | 89.4 | 342 |
| binary-heap+lazy-delete | yes | 57.7 | 64.2 | 76.4 | 402 |
| pairing-heap+lazy-delete | yes | 67.5 | 73.5 | 81.9 | 463 |
| sorted-array | no (O(K)) | 43.7 | 43.2 | 133 | 19531 |
| linear-scan | no (O(K)) | 25.6 | 50.2 | 588 | skipped |

## D. Structure memory at K = 5,000 (excluding the reservation records themselves)

| Dispatcher | Overhead (KB) |
| --- | --- |
| **binary-heap** | 53 |
| binary-heap+index | 280 |
| 4-ary-heap+index | 290 |
| binary-heap+lazy-delete | 213 |
| pairing-heap+lazy-delete | 398 |
| sorted-array | 60 |
| linear-scan | 53 |
