# Worst-case node visits, exhaustive dictionary, k = 2

Visited nodes for an exhaustive dictionary. If growth is O(m^3), visited / m^3 levels off to a constant; if it were O(m^2), visited / m^2 would level off instead.

### Alphabet size 2

| m | Nodes visited | visited / m^2 | visited / m^3 | visited / (m^3 sigma^3) |
| --- | --- | --- | --- | --- |
| 6 | 388 | 10.8 | 1.8 | 0.22 |
| 10 | 1,492 | 14.9 | 1.5 | 0.19 |
| 14 | 3,876 | 19.8 | 1.4 | 0.18 |
| 18 | 8,052 | 24.9 | 1.4 | 0.17 |
| 22 | 14,532 | 30.0 | 1.4 | 0.17 |

### Alphabet size 3

| m | Nodes visited | visited / m^2 | visited / m^3 | visited / (m^3 sigma^3) |
| --- | --- | --- | --- | --- |
| 4 | 834 | 52.1 | 13.0 | 0.48 |
| 6 | 2,409 | 66.9 | 11.2 | 0.41 |
| 8 | 5,520 | 86.3 | 10.8 | 0.40 |
| 10 | 10,767 | 107.7 | 10.8 | 0.40 |
| 12 | 18,750 | 130.2 | 10.9 | 0.40 |

### Alphabet size 4

| m | Nodes visited | visited / m^2 | visited / m^3 | visited / (m^3 sigma^3) |
| --- | --- | --- | --- | --- |
| 4 | 2,388 | 149.3 | 37.3 | 0.58 |
| 6 | 7,060 | 196.1 | 32.7 | 0.51 |
| 8 | 16,132 | 252.1 | 31.5 | 0.49 |
| 10 | 31,172 | 311.7 | 31.2 | 0.49 |
| 12 | 53,748 | 373.3 | 31.1 | 0.49 |
| 14 | 85,428 | 435.9 | 31.1 | 0.49 |
