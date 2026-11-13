## Task 1: Computational Problem Modeling & Formal Mathematical Formulation

### 1.1 Problem Statement & Real-World Domain Operational Context

Modern academic libraries operate as high-density information discovery and resource sharing environments. At the University of Makati Library Learning Commons (UMak LLC) - which encompasses both the Main Library (Admin Building, 2nd Floor) and the School of Law (SOL) Library (HPSB Building, 5th Floor) - circulation management historically relied on manual ledger recording and unindexed desktop database lookups. This legacy manual process consumed 4 minutes and 10 seconds per checkout and frequently resulted in severe queue gridlock. Under the newly specified operational Service Level Agreements (SLAs) defined in the LIBRAS Requirements Engineering Specification (SRS v2.12.10.2026), checkout operations must execute in under 30 seconds, routine book returns must complete in under 15 seconds, and catalog search results must be delivered within 1.0 second under 50 concurrent users.

Throughout this document, a **Member** is a person with a library account, and every Member has one **Account Type**: UMAK Student, Faculty, NTP / Employee, Visitor or Alumni. A **Book** is a title and edition in the catalog, and a **Copy** is one physical item of a Book with its own accession number and barcode. A **Hold** is a Member's place in the queue for a Book that has no available Copy.

Within this operational scope, two severe computational bottlenecks arise that cannot be resolved through trivial database queries or elementary routines without violating production SLAs:

1. **Typographic Query Degradation in Catalog Search (OPAC):** Members regularly search for specialized academic textbooks and author surnames with typographic errors, transposition mistakes, or partial phonetic spellings. Standard relational database wildcard queries (e.g., SQL `ILIKE '%term%'`) are substring matches, so they have no typo tolerance at all: in the benchmark of Section 3.5 they returned only 3.7% of the words within two edits of the query, while still scanning every row. Exact fuzzy evaluation without an index scales at O(N · M · |Q|) for N records with average title length M, which keeps every query proportional to catalog size and exhausts server worker pools under multi-user bursts.
2. **Hold Contention & Dispatch under High-Volume Book Returns:** High-demand curriculum textbooks accumulate long queues of Holds. When a Copy is returned at the desk (demanding an immediate transaction completion in under 15 seconds), the circulation system must instantaneously resolve the single highest-priority Member entitled to that Copy without race conditions, deadlocks, or unfair starvation between Faculty and UMAK Students.

Treating these computational challenges as trivial SQL database queries fails to provide deterministic latency bounds and leads to thread pool starvation. Therefore, Project LIBRAS models these challenges as two coupled mathematical optimization problems: (a) an approximate string matching problem solved by branch-and-bound search over a trie, and (b) a role-weighted priority scheduling optimization problem solved with an ordered priority queue.

### 1.2 Formal Mathematical Specification

#### 1.2.1 Input Parameters (I)

The computational input space I is partitioned into the bibliographic lexicon and the pool of waiting Holds.

**1. Catalog Lexicon & Query Input:**

- Let Σ be the finite alphabet of normalized catalog text: letters and digits, in lowercase with accents removed (in practice the 26 Latin letters and 10 digits, so |Σ| is about 36).
- Let D = {w_1, w_2, ..., w_N} be the lexicon: the distinct words of all Book titles and author names, where N = |D| (about 50,000 at the benchmark scale).
- For each word w in D, let P(w) be its posting list: the set of Books whose title or authors contain w.
- Let I be the identifier table: a map from each ISBN, accession number and Library of Congress (LC) call number, reduced to its letters and digits, to the Books that carry it. Identifiers are not part of D.
- Let Q ∈ Σ* be the Member's query string, and let q^1, q^2, ..., q^p be the distinct words of Q after the same normalization. Let m = |q| denote the length of one query word.
- Let k(q) ∈ {0, 1, 2} be the edit distance bound of a query word (bounded Levenshtein radius): k(q) = 0 when |q| ≤ 3 or q contains a digit, k(q) = 1 when 4 ≤ |q| ≤ 6, and k(q) = 2 when |q| ≥ 7. The maximum radius is k_max = 2.

**2. Pool of Waiting Holds:**

- Let R = {r_1, r_2, ..., r_K} be the set of waiting Holds on one Book b, where K = |R| denotes the number of contending Members (K ≤ 5,000).
- Each Hold r_i is a structured 5-tuple: r_i = ⟨u_i, t_i, ρ_i, b, s_i⟩, where u_i is the unique Member identifier, t_i is the arrival time of the Hold, ρ_i ∈ {Faculty, NTP / Employee, UMAK Student} is the Member's Account Type, b is the Book, and s_i is a unique arrival sequence number.
- Visitor and Alumni Members cannot borrow, so they cannot place a Hold and never appear in R.

#### 1.2.2 Boundary Conditions & Constraints (C)

The operational boundaries and computational invariants C are defined as follows:

- **Query Boundedness:** 1 ≤ |Q| ≤ 100 characters after trimming. An empty query or one longer than 100 characters is rejected at ingress with a 400 response, not truncated, which bounds the work of one request and prevents algorithmic denial-of-service.
- **Metric Boundedness:** The edit distance function d_Lev(q, w) must satisfy the non-negativity, identity of indiscernibles, symmetry, and triangle inequality metric axioms: d_Lev(q, w) ≤ d_Lev(q, v) + d_Lev(v, w) for all q, v, w ∈ Σ* [1], [9].
- **Search Radius Cutoff:** Only lexicon words satisfying d_Lev(q, w) ≤ k(q) are admitted as matches of the query word q, and k(q) ≤ k_max = 2.
- **Conjunctive Matching:** A Book matches the query only when every query word matches at least one word of that Book.
- **Identifier Exactness:** When the query, reduced to its letters and digits, equals an entry of the identifier table I, the Books of that entry are the whole answer. No fuzzy match is added, so an identifier that is one character off finds nothing instead of a look-alike.
- **Arrival Order:** The arrival time t_i is taken from the server clock when the Hold is placed, never from the client. The sequence numbers are strictly increasing, s_1 < s_2 < ... < s_K, so two Holds with equal scores are still totally ordered.
- **Role Weights:** To serve teaching needs first without starving students, the role weights W(ρ) are bounded constants: W(Faculty) = 86,400,000 ms (24-hour virtual arrival advance); W(NTP / Employee) = 43,200,000 ms (12-hour advance); W(UMAK Student) = 0 ms (pure FIFO).
- **Hold Eligibility:** A Hold is accepted only when the Member's Account Type can borrow and the Book has no available Copy. A Member has at most one active Hold per Book.
- **Non-Preemptive Allocation:** Once a Copy is set aside for the Member u* whose Hold was chosen, it stays set aside for the Pickup Window T_pickup, a stored library setting whose initial value is 24 hours (86,400,000 ms). When the Pickup Window passes unused, the Hold expires and the next waiting Hold is chosen for the same Copy [4].

#### 1.2.3 Objective Functions (f(x))

The dual algorithmic engines execute distinct formal optimization objectives.

**1. OPAC Catalog Approximate Match Optimization (Minimization Problem):**

```
For each query word q:
    M(q) = { w in D : d_Lev(q, w) <= k(q) }

A Book B matches Q when, for every query word q,
    some w in M(q) has B in P(w).

Dist(Q, B) = sum over query words q of
             min { d_Lev(q, w) : w in M(q) and B in P(w) }
```

The matching Books are returned in order of Dist(Q, B) ascending, so an exact match (distance 0) comes first. Books with equal distance are ordered by title.

**2. Hold Dispatch Optimization (Minimization / Priority Scheduling Problem):**

```
r* = arg min over r_i in R of ( PriorityScore(r_i), s_i )
where PriorityScore(r_i) = t_i - W(rho_i)
```

#### 1.2.4 Output Certificate (O)

The algorithms return deterministic, structured outputs O:

1. **Catalog Search Output (O_search):** The number of matching Books, `total`, and an ordered list of at most `limit` of them (default 20, maximum 50), B_1, B_2, ..., ordered such that Dist(Q, B_1) ≤ Dist(Q, B_2) ≤ .... Each Book carries its bibliographic fields and the number of its Copies that are available now, which is read from the database at query time and is not part of the index. The benchmark build of the search additionally reports the number of trie nodes visited and the execution time.
2. **Hold Dispatch Output (O_hold):** The chosen Hold r* changes from waiting to ready and records the Copy that is set aside for it, the time it was chosen and the end of its Pickup Window. The Copy's status becomes set aside. Both changes commit in the same transaction as the return, together with an entry in the append-only audit log, where each entry stores a SHA-256 hash that chains to the previous entry. After the commit the Member is told by email. The dispatch guarantees that no Hold is chosen twice and that a Copy is set aside for at most one Hold.
