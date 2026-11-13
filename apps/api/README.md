# @libras/api

The LIBRAS API: Node.js, Express and TypeScript, backed by Supabase PostgreSQL (ADR 0003). The mobile app and the Librarian pages talk only to this API.

How to run it and its tests is in the [root README](../../README.md).

## Layout

| Path | Contents |
| --- | --- |
| `src/server.ts` | The entry point: reads configuration, wires the real clock, database and email sender, and listens |
| `src/app.ts` | `createApp(deps)` builds the Express app. Each feature adds its router here |
| `src/routes/` | One router per feature. `health.ts` is the pattern to copy |
| `src/errors.ts` | `AppError` and the error handler |
| `src/clock.ts`, `src/email.ts`, `src/db.ts`, `src/logger.ts` | The things the API reaches outside itself, passed in as `AppDeps` |
| `src/members/` | Member profiles, the sign-up flow (pending sign-up, emailed code, activation) |
| `src/auth/` | Sign-in sessions, guards (`requireLibrarian`, `requireMember`), identity pass-through to PostgreSQL |
| `src/audit/` | The append-only, hash-chained audit log: `record`, `verify`, the event whitelist |
| `src/holds/` | Holds: `placeHold`, `listHolds`, `cancelHold`, the priority weights (`priority.ts`) and Hold dispatch (`dispatch.ts`: `dispatchCopy`, `announceDispatch`) |
| `src/loans/` | Loans: `confirmLoan` and `recordReturn` (the desk) and `listLoans` (My Loans) |
| `src/scanner/` | The phone as the scanner: `ScannerHub` (pairing codes, scanner tokens, the desk streams), see "The phone scanner" |
| `src/catalog/` | `CatalogSearch`: the in-memory search index, its rebuild-and-swap, and live availability |
| `src/seed/` | `npm run seed`: the Librarian and the sample catalog (`catalog-generator.ts` is pure and reproducible, `catalog.ts` writes it) |
| `src/testing/` | The HTTP test harness, also exported as `@libras/api/testing`, and the end-to-end server `e2e-server.ts` |
| `test/` | Tests, `*.test.ts`, run with Node's built-in test runner |

## Hosted configuration

In production (`NODE_ENV=production`, as on Render) the API refuses to start without `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS`, and sends email through `BrevoEmailSender`. Elsewhere, with those two Brevo settings unset, email is printed to the console. `TRUST_PROXY` (number of reverse proxies in front of the API, `1` on Render, default 0) sets Express `trust proxy` so the sign-in limiter sees the real client address. `CORS_ALLOWED_ORIGINS` (exact origins, comma separated) lets hosted web pages call the API; the default is none. `SWEEP_SECRET` (at least 32 characters, optional) mounts `POST /internal/sweeps/pickup-expiry`, which the database schedule calls to end Pickup Windows while the service sleeps (see Pickup Window expiry); production logs a warning at start without it. `scripts/` holds the hosted commands (`migrate-hosted.ts`, `check-hosted.ts`, `send-test-email.ts`, `schedule-pickup-sweep.ts`); see the Deployment section of the root README.

## Rules for new code

- **Time.** Never call `new Date()` or `Date.now()` for business logic, and never use SQL `now()` for it. Take the time from `deps.clock.now()` and pass it to PostgreSQL as a query parameter. Otherwise tests cannot move time.
- **Email.** Send only through `deps.email.send(...)`.
- **Errors.** To refuse a request, `throw new AppError(status, code, message)`. The `code` is stable snake_case for programs, and the `message` is shown to a Member or Librarian, so it says what they can do next. Anything else that is thrown becomes a 500 with code `internal_error` and a generic message. The detail is logged on the server and never returned. Every error response has the shape `{ "error": { "code": "...", "message": "..." } }` (`ApiErrorBody` in `@libras/shared`).
- **Async handlers.** Express 5 forwards a rejected promise to the error handler, so no `try`/`catch` wrapper or `next(error)` is needed.
- **Imports.** There is no build step: Node runs the TypeScript directly. Relative imports need the `.ts` extension, type imports need `import type`, and syntax that needs compiling (enums, namespaces, parameter properties) is not allowed.

## Writing an API test

```ts
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("Hold ready email", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("is sent when a Copy is returned", async () => {
    api.clock.set("2026-11-24T08:00:00.000Z"); // the API now runs at this time
    api.clock.advance({ hours: 24, seconds: 1 }); // and stands still until moved again

    const response = await fetch(`${api.baseUrl}/health`); // real HTTP

    assert.equal(response.status, 200);
    assert.equal(api.emails.sent.length, 0); // every email the API sent
    assert.equal(api.emails.lastTo("ana.reyes@umak.edu.ph"), undefined);
  });
});
```

- `api.baseUrl` is where to send requests. Tests observe behaviour through HTTP.
- `api.clock` is a `FakeClock`: `set(dateOrIsoString)`, `advance({ days, hours, minutes, seconds, milliseconds })`, `now()`. It starts at the real time and stands still.
- `api.emails` is a `CapturingEmailSender`: `sent`, `lastTo(address)`, `clear()`.
- `api.db` is the API's `pg` pool on the real local PostgreSQL, for arranging data that has no endpoint yet.
- `startTestApi({ extraRoutes })` mounts test-only routes, for example one that throws. `startTestApi({ databaseUrl })` points the API at another database.
- `startTestApi({ trustProxy: 1, signInLimit: { maxFailures, windowMinutes } })`: with `trustProxy: 1` a test gives each request a client address of its own through `X-Forwarded-For` (without it every test request is 127.0.0.1); `signInLimit` lowers the sign-in limit so a test needs fewer failures (each one reaches Supabase Auth, which has its own limit).
- Test files run one at a time (`--test-concurrency=1`) because they share one database.

## Test helpers for Members

```ts
import { createTestMember, studentSignUpBody, codeFromEmail, signInDirect } from "@libras/api/testing";

const ana = await createTestMember(api, { firstName: "Ana" }); // signs up, reads the emailed code, verifies, signs in
ana.member;      // MemberProfile
ana.accessToken; // Authorization: Bearer <accessToken>
```

`studentSignUpBody()` is a valid UMAK Student sign-up with a unique email, username and student number; `facultySignUpBody()`, `ntpEmployeeSignUpBody()`, `visitorSignUpBody()` and `alumniSignUpBody()` do the same for the other Account Types. `codeFromEmail(api.emails.lastTo(email))` reads the verification code. `startTestApi({ wrapAccounts })` wraps the real Supabase account administration, for a test that makes one of its calls fail.

Finishing a sign-up (`verifySignUp`) calls nothing outside the database inside a transaction: one transaction checks the code and creates the Member (keeping the pending sign-up), then Supabase Auth confirms the email, then the pending sign-up is deleted. A failure after the first step leaves a Member who cannot sign in yet; the answer is `503 sign_up_unfinished` and entering the same code again finishes it. A confirmed email therefore always has its Member. `createTestAccount(api)` makes a bare Supabase account (no Member profile) and, with `{ staff }`, a Librarian.

## Member sign-in and who may call a route

`POST /members/sign-in` (`members/sign-in.ts`, `signInMember`) is the one place a Member session starts. A route that needs a Member is `router.get(path, ...requireMember(deps), (_req, res) => { memberOf(res) })`; any signed-in person is `requireIdentity(deps)`; a Librarian is `...requireLibrarian(deps)`. Sessions are renewed at `POST /auth/refresh` and ended at `POST /auth/sign-out`. `AttemptLimiter` (`auth/attempt-limit.ts`) blocks a client address after repeated refusals; both sign-in routes and the scanner pairing route go through it. Each attempt reserves its failure before it runs and gives it back unless it ends in a 401 or 403, so parallel guesses cannot pass the limit together. Its state is in memory by decision (ticket #9): one instance, and a restart forgets it. Details for later tickets: the spec2-notes `ticket-9.md` (outside the repository) and the README, "Client address and the sign-in limit".

## Digital ID and Loan Policy

A Digital ID is 12 digits: the Member's fixed 6-digit Digital ID number, then a 6-digit TOTP-style token (HMAC-SHA-256 of the 60-second window under a 32-byte per-Member secret). ADR 0004 records why. `digital-id/code.ts` is the derivation (pure); `digital-id/index.ts` has `currentDigitalId(deps, memberId)`, which creates the number and secret on first use with the CSPRNG, and `verifyDigitalId(deps, code)`, which accepts the current and the previous window by `deps.clock`, compares in constant time, and throws 400 `digital_id_expired` (up to an hour old) or `digital_id_invalid`. It returns `{ memberId, window }`: the pair that names one shown code, which confirming a Loan marks as used (see Loans).

- `GET /members/me/digital-id` (Member) -> `DigitalIdResponse` `{ code, windowStartsAt, refreshAt, serverTime }`, `Cache-Control: no-store`.
- `POST /desk/members/identify` `{ code }` (Librarian) -> `{ member: { id, fullName, accountType, loans: { current, limit, loanPeriodDays } } }`. 400 `invalid_request` unless `code` is exactly 12 digits.
- `public.digital_id_secrets` has no grants for any client role, `service_role` included: only the API, connected as itself, reads it.
- `public.loan_policies` holds one row per Account Type (placeholders seeded by the migration). Librarians read Member profiles through the `members_read_staff` policy.

Tests: `test/digital-id.test.ts` (HTTP, fake clock), `test/digital-id-code.test.ts` (RFC 6238 vectors).

## Catalog search

`GET /catalog/search?q=<text>&limit=<n>` (`routes/catalog.ts`, behind the one `requireMember` guard) answers `{ query, total, results }`: Books best match first, each with `availableCopies` and `totalCopies`. No match is `200` with an empty `results`; a search that cannot run is a `400 invalid_request` or a 5xx error body. `CatalogSearch` (`catalog/catalog-search.ts`) holds one immutable index built with the shared search module (`@libras/shared`: `buildCatalogIndex`, the flat trie of ADR 0001). Every change to Books or to what identifies a Copy bumps `catalog_revision` (statement triggers); a search that sees a newer revision starts one rebuild in the background and keeps answering from the current index until the new one is swapped in with a single assignment, so a search in flight is never disturbed. A catalog change therefore shows in results a moment later, not on the very next request: a test that changes the catalog waits with `eventually` (`test/eventually.ts`). Availability is read from the Copies for the matched Books on every search. `npm run measure:search -w @libras/api` measures latency over HTTP on the seeded catalog (`npm run seed` first).

## Holds

`src/holds/`, `routes/holds.ts` and the migration `supabase/migrations/20261112200000_holds.sql`. A Hold is a Member's place in the queue for a Book that has no available Copy.

- `POST /holds` `{ bookId }` (Member) -> `201 { hold }`, status `waiting`. Refused with `403 cannot_borrow` (Visitor and Alumni, by `canBorrow`), `404 book_not_found`, `409 copy_available` (a Copy is `available` now: borrow it instead; this is the same live count the Book page shows), `409 book_on_loan` (the Member has a Copy of the Book on Loan: their own return would otherwise set it aside for them again) and `409 hold_exists` (the Member already has a `waiting` or `ready` Hold on the Book; only that unique index is reported this way, by its name). A Book with no Copies at all can be held.
- `GET /members/me/holds` (Member) -> `{ holds }`: every Hold of the Member, active ones (`waiting`, `ready`) first, each group newest first. Each has `pickupEndsAt`: the end of the Pickup Window once the Hold has been chosen, null before. The Member's own ended windows are expired first, so a `ready` Hold in the list always has a window that is still running. Read through `withIdentity`, so row-level security is the second layer.
- `POST /holds/:id/cancel` (Member) -> `{ hold }`, status `cancelled`. A `waiting` Hold leaves the queue. A `ready` Hold gives up its set-aside Copy, which in the same transaction goes to the Book's next waiting Hold (with a Pickup Window of its own from the cancel, an email and an audit entry) or becomes available when nobody waits. A `fulfilled`, `expired` or `cancelled` Hold is `409 hold_not_cancellable`, and so is a `ready` Hold whose Pickup Window has ended (it is expired on the spot: see Pickup Window expiry); `409 hold_conflict` only if the Hold changed three times while the request waited. A Hold that is not the Member's is `404 hold_not_found`, the same as one that does not exist.
- The table keeps what the dispatcher of ADR 0001 needs: `placed_at` (arrival, from `deps.clock`), `weight_hours` (Faculty 24, NTP / Employee 12, UMAK Student 0: `HOLD_WEIGHT_HOURS`), `score` (`placed_at` minus the weight, a check constraint keeps them in step) and `seq` (arrival order). The queue of a Book is its `waiting` Holds ordered by `(score, seq)`, served by the partial index `holds_queue_idx`. There is no in-memory queue. The states are `waiting`, `ready`, `fulfilled`, `expired`, `cancelled`. A Hold that was chosen keeps `copy_id`, `ready_at` and `pickup_ends_at`, and `fulfilled_at` once its Member borrowed the Copy and `expired_at` once its window was ended.
- At most one active Hold per Member per Book is enforced by the partial unique index `holds_one_active_per_member_and_book`, so two requests at once cannot both succeed (the second is `409 hold_exists`). After a cancel the Member may place a new Hold.
- Clients have `select` only, on their own rows (`holds_read_own`). The API writes Holds as itself.
- Placing a Hold reads the Book's Copies with a shared row lock, so it waits for a return of one of them that is in progress and then sees its outcome (see Hold dispatch).

Tests: `test/holds.test.ts` (HTTP: placing, every refusal, cancelling, privacy, the row-level security check through a route that queries as the signed-in Member, the dispatcher's columns) and the pure weights.

## Hold dispatch

`src/holds/dispatch.ts` and the migration `supabase/migrations/20261113140000_hold_dispatch.sql`. ADR 0001 has the algorithm, ADR 0006 the locks and the decisions.

- **`dispatchCopy(deps, tx, copy, { at, cause, actorId, causeEntry? })`** places a Copy that nobody has any more. One query (`DISPATCH_SQL`) makes the Book's waiting Hold with the lowest `(score, seq)` `ready` for this Copy: `copy_id`, `ready_at = at` and `pickup_ends_at = at` plus `library_settings.pickup_window_hours` (one row, seeded as 24). The Copy becomes `set_aside`, or `available` when no Hold was waiting. It records the audit entry of what freed the Copy when the caller passes one (`causeEntry`: `copy_returned`, `hold_expired`), then the audit event `hold_dispatched` (subject: the Hold; data `{ memberId, copyId, bookId, accessionNumber, pickupEndsAt, cause }`; actor: whoever freed the Copy) and returns a `HoldDispatch` (the Member's name and email, the Book, the end of the Pickup Window) or null. Call it last in the transaction and write nothing to the audit log before it: the audit log serialises its writers, so every entry is written after all other work, and it reads cause, then effect.
- **The caller's rules.** Call it inside the transaction that freed the Copy, with the Copy's row locked (`lockCopy` of the Loans module, or `lockCopyById`), and call it last, because it writes the audit log. After the commit, pass the result to `announceDispatch(deps, dispatch)`, which sends the Hold-ready email (`holdReadyEmail`) and only logs a failure to send. The lock order of every writer is the Member's row, the Copy's row, then a Hold's row.
- **Who calls it.** `recordReturn` (cause `copy_returned`, actor the Librarian) and `cancelHold` for a ready Hold (cause `hold_cancelled`, actor the Member). Pickup Window expiry is the third (cause `pickup_window_expired`, no actor).
- **The desk.** `POST /desk/returns` answers `loan.heldFor`: `{ memberName, pickupEndsAt }` when the returned Copy is now set aside, null when it is available.
- **Borrowing the set-aside Copy.** `takeCopy` in `src/loans/index.ts` is the one place that decides whether a Copy may go out to a Member. A `set_aside` Copy goes only to the Member whose `ready` Hold has that `copy_id`, and only while `pickup_ends_at > now`; the Hold becomes `fulfilled` in the Loan's transaction; anyone else gets `409 copy_set_aside`. When the window has ended but nobody has expired the Hold yet, the confirmation expires it and runs again (see Pickup Window expiry).
- **The database's own word.** `holds_one_ready_per_copy` (at most one ready Hold per Copy), and check constraints: a waiting Hold has no Copy, a ready one has a Copy and a Pickup Window, `fulfilled_at` goes with `fulfilled`.

Tests: `test/hold-dispatch.test.ts` (HTTP: a return makes the Hold ready and sets the Copy aside; no Hold, the Copy is available; the email; the order by role weights with Faculty and NTP / Employee Members made by the fixture `memberWithHold`, because their sign-up is not built yet; the stored Pickup Window length; the refusal to other Members; fulfilment; the audit entry; cancelling a ready Hold; and "Hold dispatch at the same moment": several Copies of one Book returned at once at two desks, a return against a cancel, against Loans and against Holds being placed, and four races with a fixed order, made by holding the audit log so that the first request has done everything but commit). Removing `for update skip locked` from the dispatch query, the `for update` of `cancelHold` or the `for share` of `placeHold` each makes a test there fail. Removing only the Copy's row lock fails none of them, because the Hold's row lock and the guards on the Loan and the Hold still decide those races; the Copy lock is kept for the lock order (without it a cancel and a Loan can deadlock) and because `dispatchCopy` relies on it.

## Pickup Window expiry

`src/holds/expiry.ts`, `src/holds/sweeper.ts`, `routes/sweeps.ts`, `scripts/pickup-sweep-schedule.ts` and the migration `supabase/migrations/20261113160000_pickup_expiry.sql` (`holds.expired_at`, an index on the ready Holds' `pickup_ends_at`, the audit event type `hold_expired`). ADR 0007 has the decisions.

- **`expireHold(deps, holdId)`** ends one window if it has passed (`pickup_ends_at <= now`): reads the Hold without a lock, locks the Copy (`lockCopyById`), locks the Hold, checks it is still `ready` and due, sets it `expired` with `expired_at`, then `dispatchCopy` with cause `pickup_window_expired`, which records `hold_expired` (its `causeEntry`; subject: the Hold; data `{ memberId, copyId, bookId, accessionNumber, pickupEndsAt, expiredAt }`; no actor) before its own entry (the next waiting Hold gets a Pickup Window of its own from now, an email and a `hold_dispatched` entry, or the Copy becomes available), and sends the email after the commit. It answers `expired` or `skipped` (the Hold was borrowed, cancelled or not due).
- **`expireDueHolds(deps, { memberId? })`** is the sweep: every due ready Hold (or one Member's), oldest window first, one transaction each; a failure is logged and the others go on. It returns how many it expired.
- **Who runs it.** `startPickupSweeper(deps)` every 60 seconds from `server.ts` (and the end-to-end server); `POST /internal/sweeps/pickup-expiry` with `Authorization: Bearer <SWEEP_SECRET>` (`200 { expired }`, `401 invalid_sweep_secret`; no route at all when `SWEEP_SECRET` is unset), which the database's pg_cron schedule calls every five minutes to wake a sleeping service (`npm run schedule:hosted`, root README); and the three places that must not see an ended window as open: `takeCopy` (a Loan after the window expires the Hold and runs again, as if the sweep had run first), `cancelHold` (refused as `hold_not_cancellable`) and `listHolds`.
- **Tests** (`test/pickup-expiry.test.ts`, all on the fake clock): `api.sweepPickupWindows()` runs the sweep; `startTestApi({ sweepIntervalMs })` runs the real timer; `startTestApi({ sweepSecret })` mounts the endpoint. Reading a Hold through the API expires it if due, so to look at a Hold the sweep has not touched, read `public.holds` directly. `test/pickup-sweep-schedule.test.ts` runs the database schedule's SQL against the local Supabase (pg_cron, pg_net, vault).

## Loans

`src/loans/`, `routes/loans.ts` and the migration `supabase/migrations/20261112220000_loans.sql`. A Loan exists only once a Librarian confirms it at the desk; no Member endpoint creates one, and clients have `select` only on `public.loans`.

- `POST /desk/loans` `{ digitalId, copy }` (Librarian) -> `201 { loan, member }`. `digitalId` is the 12 digits that were scanned (verified again here, by `verifyDigitalId`), `copy` is the Copy's barcode or its accession number (typed in either case). `loan` is `{ id, bookTitle, accessionNumber, checkedOutAt, dueAt }` and `member` is the `DeskMember` with the Loan counted. Refusals, each with a message the desk page shows (`LOAN_MESSAGES`): `400 invalid_request`, `400 digital_id_expired` / `digital_id_invalid`, `409 digital_id_used`, `404 copy_not_found`, `403 cannot_borrow` (Loan Policy limit of zero: Visitor, Alumni), `409 loan_limit_reached`, `409 copy_on_loan`, `409 copy_set_aside` (set aside for another Member's Hold).
- `GET /members/me/loans` (Member) -> `{ loans, loanLimit, loanPeriodDays }`: every Loan of the Member, current ones first (due soonest at the top), then returned ones. Each has `checkedOutAt`, `dueAt`, `returnedAt` and `overdue` (still out and past `dueAt` by `deps.clock`). Read through `withIdentity`, so row-level security is the second layer (`loans_read_own`; Librarians read all through `loans_read_staff`, which is how the desk counts a Member's Loans).
- **Due date.** `loanDueAt` (`@libras/shared`): the last millisecond of the library day (UTC+8, `LIBRARY_UTC_OFFSET_HOURS`) that is the Loan Policy's `loan_period_days` after the checkout day. A Loan is overdue from the next day.
- **One transaction** (`confirmLoan`): lock the Member's row, then the Copy's row (`for no key update`), check the limit and the Copy's status, insert the Loan, set the Copy `on_loan`, record the audit event `loan_confirmed` last. Setting the Copy `on_loan` is what makes the live count of available Copies fall for search, the Book page and the Hold action. Two requests at once for one Copy, or for a Member's last allowed Loan, yield exactly one Loan; the partial unique index `loans_one_open_per_copy` (one open Loan per Copy) is the database's own backstop. Any later writer that needs both locks (returns, Hold dispatch) must take them in the same order: Member, then Copy.
- **An open Loan** is one with `returned_at` null. A return sets `returned_at` and frees the Copy; My Loans then lists it as past.
- **Returns.** `POST /desk/returns` `{ copy }` (Librarian; the Copy's barcode or accession number, with no Member involved) -> `200 { loan }`, where `loan` is `{ id, bookTitle, accessionNumber, memberName, checkedOutAt, dueAt, returnedAt, late }` (`late`: back after its due day; Tier 1 charges nothing). Refusals, with the words in `RETURN_MESSAGES`: `400 invalid_request`, `404 copy_not_found`, `409 copy_not_on_loan` (on the shelf, set aside, or already returned), `409 return_conflict` (the Copy changed hands three times while the request waited; scan again). `recordReturn` in `src/loans/index.ts` is one transaction: an unlocked read finds who has the Copy out, then it locks that Member's row and the Copy's row (the same order as `confirmLoan`), reads the open Loan again, sets `returned_at` and calls `dispatchCopy` last (see Hold dispatch), which records the audit event `copy_returned` and then, when a Hold was chosen, `hold_dispatched`. `loan.heldFor` says whose Hold the Copy is now set aside for, or is null. Two returns of one Copy at the same moment yield one return, one audit entry and one `copy_not_on_loan`.
- **Set-aside Copies.** `takeCopy` in `src/loans/index.ts` is the one place that decides whether a Copy may go out to a Member: a `set_aside` Copy goes only to the Member of its ready Hold, which becomes `fulfilled` (see Hold dispatch).
- **Used Digital IDs.** `public.digital_id_uses` records the Member and window of a code that confirmed a Loan, and the Librarian. That Librarian may confirm more Loans with the same code while it is still accepted (several Copies in one visit); any other Librarian gets `digital_id_used`. A refused Loan records nothing. No client role can read the table.

Tests: `test/loans.test.ts` (HTTP: confirmation and due date, availability falling, every refusal, the audit entry, three races, My Loans order and overdue with the fake clock, privacy and the row-level security checks).

`test/returns.test.ts` (HTTP: a return closes the Loan, frees the Copy and moves the Loan to the Member's past Loans with its return date; typed accession numbers; availability in search and on the Book page; the loan limit freed; a late return; every refusal; Librarian only; the audit entry; and the races: two Librarians returning one Copy, a burst of ten scans of one Copy, and returns mixed with Loans for the same Members). `test/loans-harness.ts` holds what the Loan and return tests share.

## The end-to-end API

`src/testing/e2e-server.ts` is the API for end-to-end tests: the real app, but emails are captured and readable at `GET /e2e/emails?to=<address>`, a Book can be added at `POST /e2e/books` (`testing/catalog-fixture-routes.ts`; it answers once search can find the Book), and a Librarian confirms a Loan for a Member at `POST /e2e/loans` `{ email, bookId, daysAgo? }` (`testing/loan-fixture-routes.ts`: the real confirmation with the code on the Member's phone and an available Copy, or the Copy set aside for the Member's ready Hold; `daysAgo` sets the clock back to make an overdue Loan) and records the return of the Copy the Member has out of a Book at `POST /e2e/returns` `{ email, bookId }` (the real return, so a waiting Hold on the Book becomes ready and its email is captured), and lets a Pickup Window run out at `POST /e2e/holds/lapse` `{ email, bookId }` (moves the window of the Member's ready Hold two days back and runs the expiry sweep; answers `{ expired }`). It is a separate entry point that `server.ts` never imports, listens on loopback only, and exits at once when `NODE_ENV=production`, so production cannot expose it (tests in `test/e2e-mailbox.test.ts`). `npm run e2e -w @libras/mobile` starts it.

## The phone scanner

ADR 0005 has the transport decision. `src/scanner/hub.ts` (`ScannerHub`, in memory, one per app) and `src/routes/scanner.ts` are the whole feature; nothing touches the database.

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /desk/scanner/events[?desk=<id>]` | Librarian | A `text/event-stream`. Events (`DeskScannerEvents` in `@libras/shared`): `desk` (the desk id), `pairing` (a six-digit code valid 120 s, re-sent when it changes), `paired`, `unpaired`, `scan` (`{text}`), `end` (the stream's 30 minutes are up: reconnect with `?desk=`). A comment line every 15 s. `?desk=` takes the earlier pairing back for the same Librarian within 60 s of the stream dropping |
| `POST /desk/scanner/unpair {deskId}` | Librarian | Ends the pairing of one of their desk pages (204, also for an id that is not theirs) |
| `POST /scanner/pair {code}` | nobody | The phone's code (spaces allowed) -> `{token}`. 403 `pairing_code_invalid` for a wrong, used or expired code (one message for all three); 429 `too_many_attempts` after 5 wrong codes in 5 minutes per client address |
| `POST /scanner/scans {text}` | scanner token | 202. 400 `scan_rejected` unless `readScan` accepts it (the same whitelist the desk page applies), 401 `pairing_lost`, 409 `desk_offline` (the desk page's stream is away), 429 `too_many_scans` (30 in 10 s) |
| `GET /scanner/status` | scanner token | `{deskOnline}`, or 401 `pairing_lost` |
| `DELETE /scanner/pairing` | scanner token | The phone leaves (204); the desk page gets `unpaired` and a new code |

The scanner token (32 random bytes, kept only as a SHA-256 hash in memory) is not a Supabase session: every Librarian and Member endpoint refuses it (tested against each desk endpoint). A pairing code names one desk page, belongs to the Librarian whose stream showed it, and is cleared when used. Time (code life, grace, scan window) comes from `deps.clock`, so tests move it; `AppOptions.scanner` and `AppOptions.pairingLimit` change the numbers in tests. `test/scanner.test.ts` reads the stream the way the browser does (`readEventStream` from `@libras/shared`).

## Audit log

`src/audit/` and the migration `supabase/migrations/20261112131200_audit_log.sql`. An append-only log of failed sign-ins, confirmed Loans, returns, Hold dispatches and Hold expiries. Each entry stores a SHA-256 hash over its content and the previous entry's hash.

- **Record:** `createAuditLog(deps).record({ type, actorId?, subject?, data }, tx?)`. Time comes from `deps.clock`. Pass the client of a transaction (`withTransaction(deps.db, (tx) => ...)`) to record atomically with a change; record last in that transaction, because other writers of the log wait for it to end. The transaction must be READ COMMITTED (the default); the database refuses others.
- **Whitelist:** event types and the exact shape of `subject` and `data` are in `src/audit/events.ts` (strict objects, so an unlisted field such as a password cannot be recorded). The database has its own list, `public.audit_event_types`: a new type needs an entry in `events.ts` and an `insert` in a migration.
- **Chain:** the database, not the API, assigns the gapless `seq`, the `prev_hash` and the `hash` in a BEFORE INSERT trigger that holds an advisory lock until the transaction ends. Updates, deletes and TRUNCATE are refused by ENABLE ALWAYS triggers; `anon`, `authenticated` and `service_role` have no privileges, and row-level security is on with no policy.
- **Verify:** `createAuditLog(deps).verify({ anchor? })` recomputes every hash in TypeScript (`src/audit/canonical.ts`) and reports `content_changed`, `broken_link`, `missing_entry` or `anchor_mismatch` with the entry. From a terminal: `npm run audit:verify -w @libras/api` (local) or `npm run audit:verify:hosted -w @libras/api` (reads `.env.hosted`), optionally `-- --anchor <seq>:<hash>`.
- **Limits:** the table owner (the role migrations and the API use) can still ALTER or DROP the table or disable the triggers. Changes made that way are detected by verification, except removing the newest entries, or rewriting every entry from the changed one onwards; only a head (`seq:hash`) kept outside the database and passed as `anchor` detects those.
