# Tier 1 verification on the hosted system: measurements

Issue #20. Measured on 2026-11-13 against the hosted system (Render free web service `libras-api` in Singapore, Supabase free project in Singapore, the 45,460 Book / 86,679 Copy sample catalog from `npm run seed:hosted`). The client was the developer's computer on its normal connection, which adds the network time shown below. Reproduce with `npm run verify:hosted -- search` and `npm run verify:hosted -- dispatch` (`apps/api/scripts/verify-hosted.ts`); both read `.env.hosted` and print no secret.

Targets (ADR 0001, SRS): search within 1.0 s at 50 concurrent patrons; Hold dispatch within 10 ms.

## Search through the hosted API

Search is `GET /catalog/search`, as a signed-in Member (a measurement Visitor, `npm run verify:hosted -- member`). Times are milliseconds from the client, so each includes about 63 ms of network to Render (the same measurement on a route that does no work, p50 62.7, p95 78.6).

| Load | n | p50 | p95 | p99 | max | Within 1.0 s |
| --- | --- | --- | --- | --- | --- | --- |
| One request at a time (6 kinds of query: exact word, 1 typo, 2 typos, two words, ISBN, no match) | 300 | 98 | 128 | 221 | 543 | 100% |
| 50 users at once, each pausing 2 to 5 seconds between searches (how patrons search, about 11 searches a second) | 500 | 107 | 537 | 859 | 1075 | 99.4% |
| 50 users at once, no pause: always 50 requests in flight (run 1) | 600 | 1497 | 2422 | 2630 | 2836 | 15.7% |
| The same, run 2 | 600 | 1497 | 2204 | 2656 | 2860 | 18.8% |
| The same, run 3 | 600 | 1390 | 1999 | 2104 | 2482 | 22.3% |

The first search after the service woke took 728 ms (the catalog index is built at start).

Result against the one-second target:

- **Met** for 50 concurrent patrons who search the way people do (reading and typing between searches): 99.4% of searches within 1.0 s, p99 859 ms.
- **Not met** when 50 users hold 50 requests in flight with no pause at all: the free service tops out at 33 to 36 searches a second and, with 50 waiting, every search takes about 50 / 35 = 1.4 s (Little's law). That is a throughput ceiling, not a slow search: a single search takes about 100 ms end to end.

Where the ceiling comes from (the same 50 users, no pause, on other routes, measured the same day):

| Route | Throughput | What it adds |
| --- | --- | --- |
| a route that does nothing (404) | 358 req/s | the platform |
| `/health` (one database query) | 249 req/s | a database round trip |
| `/members/me` (Supabase Auth `GET /user` plus the identity-scoped database transaction every Member route runs) | 58 req/s | the guard |
| `/catalog/search` | 26 to 36 req/s | the search and its availability query, about 20 ms of server time on this instance |

A free Render web service has 0.1 CPU. The same code on the developer's laptop with the local database ran 214 searches a second at 50 users (p50 239 ms), so the ceiling is the instance, not the algorithm (the trie search is about 1 ms of CPU on the laptop). The SRS peak of 250 queries a second is far beyond a free instance.

Options, none applied (a choice for the developer):

1. Accept it for the demo: patrons do not search with zero pause, and the demo has a handful of people. State the result as above in the defense.
2. Move `libras-api` to Render's Starter plan (0.5 CPU, paid) for the demo week and run `npm run verify:hosted -- search` again. About five times the CPU should bring the no-pause run under one second; this is an estimate, not a measurement.
3. Reduce the work of every request (not done: caching the Supabase Auth answer for a few seconds would stop a signed-out session working at once, which the guard's comment says is on purpose).

## Hold dispatch on the hosted database

Part 1: the dispatch query itself (`DISPATCH_SQL` in `apps/api/src/holds/dispatch.ts`, the whole queue of ADR 0001) on the hosted PostgreSQL, with a queue of 100, 1,000 and 5,000 waiting Holds on one Book (5,000 is the ADR's maximum per title; roles weighted 0, 12 and 24 hours). Each size is built inside a transaction that is rolled back, so nothing is kept. 100 dispatches per size. "Database execution time" is PostgreSQL's own time from `EXPLAIN ANALYZE`; the round trip adds the distance from the client to the database (about 39 ms).

| Waiting Holds | Plan | Execution p50 | p95 | p99 | max | Round trip p50 |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | `holds_queue_idx` | 0.6 ms | 0.8 | 0.8 | 0.8 | 39.2 ms |
| 1,000 | `holds_queue_idx` | 0.6 ms | 0.8 | 0.9 | 0.9 | 39.1 ms |
| 5,000 | `holds_queue_idx` | 0.6 ms | 0.8 | 1.5 | 1.5 | 39.0 ms |

Result: the dispatch query takes under 2 ms in the database whatever the queue size, inside the 10 ms limit, and uses the index. The extra time seen from outside is the network to the database.

Part 2: the whole path through the hosted API with real test Members (a borrower, a Student, an NTP / Employee and a Faculty Member), three cycles: the borrower takes the only Copy of a Book at the desk, the Student, the NTP / Employee and the Faculty Member place Holds in that order, the Copy is returned and lent on four times in a row.

| Step | n | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Place a Hold | 9 | 118 ms | 189 | 189 |
| Return with Hold dispatch (close the Loan, choose the Hold, audit, Hold-ready email) | 9 | 402 ms | 834 | 834 |
| Return with nothing waiting | 3 | 117 ms | 178 | 178 |
| Lend (confirm a Loan) | 12 | 142 ms | 621 | 621 |

Result: in all three cycles the Copy was set aside for the Faculty Member first, then the NTP / Employee, then the Student (the role-weighted order, though they placed their Holds in the opposite order), each pickup lent the set-aside Copy to the right Member, and the last return made the Copy available. A return that dispatches takes about 285 ms longer than one that does not: more database work in the same transaction (the Hold, the Copy, the audit entry) and the Brevo call for the Hold-ready email, which the API waits for before it answers the desk. Nine Hold-ready emails reached the developer's +alias inbox, which also shows email delivery from the hosted API.

The test Members, Book, Copy, Loans and Holds were deleted afterwards (`npm run verify:hosted -- cleanup` does the same).

## Audit chain

`npm run audit:verify:hosted -w @libras/api` after the runs above: "Audit log intact: 33 entries checked" (12 returns, 12 Loans, 9 Hold dispatches, all from the dispatch run). The chain must be checked again after the demo walk on real phones.

## Still to do (needs the developer)

The demo run on real phones (`docs/demo-script.md`), the real-device camera checks, and the comparison of every screen with Figma. Record the run in the table at the end of the demo script.
