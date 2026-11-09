## Task 1: Computational Problem Modeling & Formal Mathematical Formulation

### 1.1 Problem Statement & Real-World Domain Operational Context

Modern academic libraries operate as high-density information discovery and resource sharing environments. At the University of Makati Library Learning Commons (UMak LLC) - which encompasses both the Main Library (Admin Building, 2nd Floor) and the School of Law (SOL) Library (HPSB Building, 5th Floor) - circulation management historically relied on manual ledger recording and unindexed desktop database lookups. This legacy manual process consumed 4 minutes and 10 seconds per patron checkout and frequently resulted in severe queue gridlock. Under the newly specified operational Service Level Agreements (SLAs) defined in the LIBRAS Requirements Engineering Specification (SRS v2.12.10.2026), checkout operations must execute in under 30 seconds, routine book returns must complete in under 15 seconds, and catalog search results must be delivered within 1.0 second under 50 concurrent patrons.

Within this operational scope, two severe computational bottlenecks arise that cannot be resolved through trivial database queries or elementary routines without violating production SLAs:

1. **Typographic Query Degradation in Catalog Search (OPAC):** Patrons regularly search for specialized academic textbooks, author surnames, or Library of Congress (LC) call numbers containing typographic errors, transposition mistakes, or partial phonetic spellings. Standard relational database wildcard queries (e.g., SQL `ILIKE '%term%'`) are substring matches, so they have no typo tolerance at all: in the benchmark of Section 3.5 they returned only 3.7% of the words within two edits of the query, while still scanning every row. Exact fuzzy evaluation without an index scales at O(N · M · |Q|) for N records with average title length M, which keeps every query proportional to catalog size and exhausts server worker pools under multi-patron bursts.
2. **Hold Contention & Reservation Dispatch under High-Volume Book Returns:** In academic reserves, high-demand curriculum textbooks experience lengthy multi-patron reservation queues. When a physical copy of an accession number is returned at the desk (demanding an immediate transaction completion in under 15 seconds), the circulation system must instantaneously resolve the single highest-priority patron entitled to the book without race conditions, deadlocks, or unfair starvation between faculty researchers and undergraduate students.

Treating these computational challenges as trivial SQL database queries fails to provide deterministic latency bounds and leads to thread pool starvation. Therefore, Project LIBRAS models these challenges as two coupled mathematical optimization problems: (a) an approximate string matching problem solved by branch-and-bound search over a trie, and (b) a role-weighted priority scheduling optimization problem solved with an ordered priority queue.

### 1.2 Formal Mathematical Specification

#### 1.2.1 Input Parameters (I)

The computational input space I is partitioned into the bibliographic lexicon and the circulation reservation pool.

**1. Catalog Lexicon & Query Input:**

- Let Σ be a finite alphanumeric alphabet representing bibliographic characters (ASCII and Latin-1 Unicode subset, |Σ| ≤ 128).
- Let D = {w_1, w_2, ..., w_N} be the finite vocabulary of registered book titles, author tokens, and Dewey/LC call number tokens, where N = |D| denotes the total token lexicon (|D| ≥ 50,000 in an enterprise university holding).
- Let Q = (q_1, q_2, ..., q_m) ∈ Σ* be the patron's input search query string of length m = |Q|.
- Let k_max ∈ {1, 2} be the maximum permissible edit distance threshold (bounded Levenshtein radius).

**2. Reservation Hold Pool:**

- Let R = {r_1, r_2, ..., r_K} be the active set of reservation requests queued for a specific title or physical accession copy c_j, where K = |R| denotes the total number of contending patrons (K ≤ 5,000).
- Each reservation element r_i is a structured 4-tuple: r_i = ⟨u_i, t_i, ρ_i, c_j⟩, where u_i is the unique patron identifier, t_i ∈ R+ is the epoch arrival timestamp of the reservation, ρ_i ∈ {Faculty, Student, NTP, Visitor} is the verified patron role tier, and c_j is the target accession title identifier.

#### 1.2.2 Boundary Conditions & Constraints (C)

The operational boundaries and computational invariants C are defined as follows:

- **Query Boundedness:** 1 ≤ |Q| ≤ 64 characters. Arbitrary queries exceeding 64 characters are truncated at ingress to prevent algorithmic denial-of-service.
- **Metric Boundedness:** The edit distance function d_Lev(Q, w) must satisfy the non-negativity, identity of indiscernibles, symmetry, and triangle inequality metric axioms: d_Lev(Q, w) ≤ d_Lev(Q, v) + d_Lev(v, w) for all Q, v, w ∈ Σ* [1], [9].
- **Search Radius Cutoff:** Only dictionary words satisfying d_Lev(Q, w) ≤ k_max (where k_max = 2) are admitted into the candidate certificate set.
- **Monotonic Timestamping:** Reservation arrival times are strictly monotonically increasing: t_1 < t_2 < ... < t_K, governed by synchronized NTP clocks.
- **Role Tier Weight Boosts:** To satisfy university academic research mandates without starving student patrons, role weights W_factor(ρ) are bounded constants: W_factor(Faculty) = 86,400,000 ms (24-hour virtual arrival priority advance); W_factor(Student) = 0 ms (pure FIFO); W_factor(NTP) = 43,200,000 ms (12-hour boost); W_factor(Visitor) = -86,400,000 ms (deprioritized below institutional patrons).
- **Non-Preemptive Queue Allocation:** Once an accession copy c_j transitions to status READY_FOR_PICKUP for patron u*, the claim window is bounded by T_claim = 48 hours (172,800,000 ms), after which uncollected books trigger automated expiration and queue extraction of the next candidate [4].

#### 1.2.3 Objective Functions (f(x))

The dual algorithmic engines execute distinct formal optimization objectives.

**1. OPAC Catalog Approximate Match Optimization (Minimization Problem):**

```
min over w in D of d_Lev(Q, w)   subject to   d_Lev(Q, w) <= k_max (k_max = 2)
```

where the similarity ranking metric is computed as:

```
Score(Q, w) = (1.0 - d_Lev(Q, w) / max(|Q|, |w|)) * IDF(w) * PopularityWeight(w)
```

**2. Reservation Queue Dispatch Optimization (Minimization / Priority Scheduling Problem):**

```
r* = arg min over r_i in R of PriorityScore(r_i)
where PriorityScore(r_i) = t_i - W_factor(rho_i)
```

#### 1.2.4 Output Certificate (O)

The algorithms return deterministic, structured mathematical output certificates O:

1. **Catalog Search Output Certificate (O_search):** A sorted array of candidate tuples S_res = [⟨w_1, d_1, score_1⟩, ⟨w_2, d_2, score_2⟩, ..., ⟨w_k, d_k, score_k⟩] where d_i ≤ 2, ordered such that score_1 ≥ score_2 ≥ ... ≥ score_k, accompanied by execution telemetry: total_tokens_evaluated, pruned_branches_count, and execution_duration_ms.
2. **Circulation Hold Resolution Certificate (O_hold):** A deterministic allocation certificate r* = ⟨u*, c_j, Barcode_accession, Timestamp_allocated, PickupDeadline, VerificationHash⟩ guaranteeing zero race conditions, instantaneous copy status transition to READY_FOR_PICKUP, and automated dispatch of email alerts.
