# Reservation dispatcher benchmark results

Generated 2026-11-26T12:23:50.461Z on 16x AMD Ryzen 7 PRO 5850U with Radeon Graphics, 15.3 GB RAM, Node v24.16.0, win32 x64, benchmark code at commit 97d046449d70.
Bold = **binary-heap+index**, the in-memory reference of the chosen dispatcher (an array binary heap with a position index, so a cancel is O(log K)). LIBRAS ships the dispatcher as the PostgreSQL queue measured in pg.md; plain binary-heap is the first milestone sketch, whose cancel is a linear search.
Role mix: 70% Student, 15% Faculty, 10% NTP, 5% Visitor. Priority = arrival time minus role weight. All numbers are nanoseconds per operation, median across 7 trials (each trial runs every structure once, in a shuffled order) with the IQR across trials; lower is better. "skipped" = quadratic and impractically slow at that size.

## A. Fill K reservations then drain them all (ns per operation)

| Dispatcher | K=100 | K=1,000 | K=5,000 | K=50,000 |
| --- | --- | --- | --- | --- |
| **binary-heap+index** | 1559 (IQR 505) | 2303 (IQR 161) | 1388 (IQR 31.3) | 926 (IQR 67.6) |
| binary-heap | 1842 (IQR 635) | 1677 (IQR 25.9) | 797 (IQR 49.5) | 343 (IQR 27.9) |
| 4-ary-heap+index | 1433 (IQR 508) | 2044 (IQR 106) | 1124 (IQR 20.6) | 695 (IQR 64.9) |
| binary-heap+lazy-delete | 1011 (IQR 319) | 1318 (IQR 40.1) | 878 (IQR 136) | 450 (IQR 54.9) |
| pairing-heap+lazy-delete | 1091 (IQR 818) | 997 (IQR 48.1) | 832 (IQR 175) | 495 (IQR 81.1) |
| sorted-array | 814 (IQR 259) | 741 (IQR 43.8) | 700 (IQR 48.1) | 3451 (IQR 369) |
| linear-scan | 1593 (IQR 1374) | 3234 (IQR 239) | 5239 (IQR 311) | skipped |

## B. Steady state: each step is one return (popMin) plus one new hold (push), queue stays ~K

Per-operation p50 and p99 within a trial, measured over batches of 500 operations; median across trials (IQR of the p50 in brackets).

| Dispatcher | K=100 p50 / p99 | K=1,000 p50 / p99 | K=5,000 p50 / p99 | K=50,000 p50 / p99 |
| --- | --- | --- | --- | --- |
| **binary-heap+index** | 234 / 667 (IQR 5.7) | 371 / 735 (IQR 77.0) | 482 / 1261 (IQR 98.0) | 815 / 1713 (IQR 187) |
| binary-heap | 57.0 / 636 (IQR 51.0) | 114 / 341 (IQR 52.7) | 174 / 453 (IQR 45.7) | 239 / 532 (IQR 22.2) |
| 4-ary-heap+index | 209 / 731 (IQR 6.9) | 270 / 636 (IQR 29.5) | 343 / 1140 (IQR 40.5) | 662 / 1236 (IQR 189) |
| binary-heap+lazy-delete | 90.6 / 672 (IQR 2.7) | 137 / 634 (IQR 22.9) | 215 / 896 (IQR 27.8) | 321 / 743 (IQR 15.7) |
| pairing-heap+lazy-delete | 93.2 / 468 (IQR 16.6) | 110 / 531 (IQR 28.3) | 209 / 1468 (IQR 15.6) | 460 / 4112 (IQR 130) |
| sorted-array | 58.4 / 262 (IQR 5.3) | 47.6 / 355 (IQR 1.9) | 416 / 977 (IQR 114) | 7013 / 11165 (IQR 19032) |
| linear-scan | 206 / 537 (IQR 12.5) | 2271 / 5608 (IQR 156) | 12387 / 23314 (IQR 257) | skipped |

## C. Churn with cancellations: 40% push, 40% popMin, 20% cancel/expire a random queued hold (ns per operation)

| Dispatcher | Fast cancel? | K=100 | K=1,000 | K=5,000 | K=50,000 |
| --- | --- | --- | --- | --- | --- |
| **binary-heap+index** | yes | 189 (IQR 46.8) | 222 (IQR 36.0) | 285 (IQR 11.7) | 942 (IQR 86.1) |
| binary-heap | no (O(K)) | 111 (IQR 38.9) | 131 (IQR 18.6) | 319 (IQR 15.8) | 16570 (IQR 886) |
| 4-ary-heap+index | yes | 172 (IQR 30.2) | 213 (IQR 21.3) | 258 (IQR 4.0) | 808 (IQR 372) |
| binary-heap+lazy-delete | yes | 167 (IQR 36.8) | 184 (IQR 26.1) | 215 (IQR 6.8) | 432 (IQR 77.9) |
| pairing-heap+lazy-delete | yes | 186 (IQR 71.3) | 233 (IQR 33.9) | 252 (IQR 30.5) | 581 (IQR 55.2) |
| sorted-array | no (O(K)) | 121 (IQR 36.1) | 136 (IQR 20.8) | 320 (IQR 18.3) | 21312 (IQR 10556) |
| linear-scan | no (O(K)) | 90.8 (IQR 19.7) | 136 (IQR 21.3) | 1211 (IQR 47.8) | skipped |

Growth of the churn cost from K = 100 to K = 50,000: binary-heap (linear cancel) x149.8, binary-heap+index x5.0, binary-heap+lazy-delete x2.6, pairing-heap+lazy-delete x3.1. A queue whose cancel is a linear search degrades with K; the chosen reference needs no cap on K.

## D. Structure memory at K = 5,000 (excluding the reservation records themselves)

| Dispatcher | Overhead (KB) |
| --- | --- |
| **binary-heap+index** | 288 |
| binary-heap | 65 |
| 4-ary-heap+index | 284 |
| binary-heap+lazy-delete | 205 |
| pairing-heap+lazy-delete | 395 |
| sorted-array | 60 |
| linear-scan | 54 |
