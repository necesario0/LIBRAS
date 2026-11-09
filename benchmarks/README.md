# LIBRAS algorithm benchmarks

Prototype benchmark code for the two algorithm choices in PBL Milestone 1 (Bounded Trie Levenshtein Search and Role-Weighted Min-Heap Dispatcher) against alternative algorithms. The write-up is in [`docs/algorithm-benchmark-report.md`](../docs/algorithm-benchmark-report.md) and the decision record is [`docs/adr/0001-fuzzy-search-and-hold-dispatch-algorithms.md`](../docs/adr/0001-fuzzy-search-and-hold-dispatch-algorithms.md).

Written in TypeScript to match the project stack (Node.js, Express, TypeScript). Needs Node 22.18 or newer, which runs `.ts` files directly.

## Run

```bash
cd benchmarks
npm install
npm test               # correctness: every candidate vs brute-force reference
npm run bench:search   # fuzzy search latency, memory, scaling  -> results/search.md
npm run bench:heap     # hold dispatcher throughput             -> results/heap.md
npm run bench:claims   # checks numbers quoted in the milestone -> results/claims.md
npm run bench:pg       # PostgreSQL candidates (needs the container below) -> results/pg.md
npm run matrix         # weighted decision matrix               -> results/decision-matrix.md
```

### PostgreSQL container for `bench:pg`

```bash
docker run -d --name libras-bench-pg -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=libras_bench \
  -p 127.0.0.1:55432:5432 postgres:16
# override the connection with BENCH_PG_URL if needed; remove with: docker rm -f libras-bench-pg
```

The credentials are throwaway and the port is bound to localhost only.

Add `--quick` to any `bench:*` script for a fast smoke run (smaller sizes, written to `*-quick.*`). Close other heavy programs and do not run two benchmarks at once; timings are sensitive to load.

## Layout

| Path | Contents |
| --- | --- |
| `src/data/catalog.ts` | Seeded synthetic lexicon and typo-query generator |
| `src/search/` | Fuzzy-search candidates: `trie-dp` (the milestone design, spec-faithful), `trie-dp-flat` (same algorithm, optimised), `linear-scan`, `bk-tree`, `symspell`, `ngram` |
| `src/heap/` | Dispatcher candidates: binary heap (spec and indexed), 4-ary heap, lazy-delete heap, pairing heap, sorted array, linear scan |
| `src/bench-*.ts`, `src/verify-claims.ts`, `src/decision-matrix.ts` | Runners |
| `test/` | Correctness tests against a brute-force Levenshtein and a re-sorting queue model |
| `results/` | Generated output from the runs reported in the docs |

## Limitations

- The data is synthetic because the real UMak catalog was not available. Re-run on real holdings before treating pruning or branching figures as final.
- `bench:search`, `bench:heap` and `bench:claims` run in-process on one thread, without a network or Express. `bench:pg` measures PostgreSQL candidates through a local Docker container, so its round trips include port-forwarding overhead.
- Numbers come from a single laptop (see the header of each results file) and will differ on Render.
