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
| `src/catalog/` | `CatalogSearch`: the in-memory search index, its rebuild-and-swap, and live availability |
| `src/seed/` | `npm run seed`: the Librarian and the sample catalog (`catalog-generator.ts` is pure and reproducible, `catalog.ts` writes it) |
| `src/testing/` | The HTTP test harness, also exported as `@libras/api/testing`, and the end-to-end server `e2e-server.ts` |
| `test/` | Tests, `*.test.ts`, run with Node's built-in test runner |

## Hosted configuration

In production (`NODE_ENV=production`, as on Render) the API refuses to start without `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS`, and sends email through `BrevoEmailSender`. Elsewhere, with those two Brevo settings unset, email is printed to the console. `TRUST_PROXY` (number of reverse proxies in front of the API, `1` on Render, default 0) sets Express `trust proxy` so the sign-in limiter sees the real client address. `CORS_ALLOWED_ORIGINS` (exact origins, comma separated) lets hosted web pages call the API; the default is none. `scripts/` holds the hosted commands (`migrate-hosted.ts`, `check-hosted.ts`, `send-test-email.ts`); see the Deployment section of the root README.

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

`studentSignUpBody()` is a valid UMAK Student sign-up with a unique email, username and student number; `facultySignUpBody()`, `ntpEmployeeSignUpBody()`, `visitorSignUpBody()` and `alumniSignUpBody()` do the same for the other Account Types. `codeFromEmail(api.emails.lastTo(email))` reads the verification code. `createTestAccount(api)` makes a bare Supabase account (no Member profile) and, with `{ staff }`, a Librarian.

## Member sign-in and who may call a route

`POST /members/sign-in` (`members/sign-in.ts`, `signInMember`) is the one place a Member session starts. A route that needs a Member is `router.get(path, ...requireMember(deps), (_req, res) => { memberOf(res) })`; any signed-in person is `requireIdentity(deps)`; a Librarian is `...requireLibrarian(deps)`. Sessions are renewed at `POST /auth/refresh` and ended at `POST /auth/sign-out`. `SignInLimiter` (`auth/sign-in-limit.ts`) blocks a client address after repeated refusals; both sign-in routes go through it. Details for later tickets: the spec2-notes `ticket-9.md` (outside the repository) and the README, "Client address and the sign-in limit".

## Catalog search

`GET /catalog/search?q=<text>&limit=<n>` (`routes/catalog.ts`, behind the one `requireMember` guard) answers `{ query, total, results }`: Books best match first, each with `availableCopies` and `totalCopies`. No match is `200` with an empty `results`; a search that cannot run is a `400 invalid_request` or a 5xx error body. `CatalogSearch` (`catalog/catalog-search.ts`) holds one immutable index built with the shared search module (`@libras/shared`: `buildCatalogIndex`, the flat trie of ADR 0001). Every change to Books or to what identifies a Copy bumps `catalog_revision` (statement triggers); a search that sees a newer revision starts one rebuild in the background and keeps answering from the current index until the new one is swapped in with a single assignment, so a search in flight is never disturbed. A catalog change therefore shows in results a moment later, not on the very next request: a test that changes the catalog waits with `eventually` (`test/eventually.ts`). Availability is read from the Copies for the matched Books on every search. `npm run measure:search -w @libras/api` measures latency over HTTP on the seeded catalog (`npm run seed` first).

## The end-to-end API

`src/testing/e2e-server.ts` is the API for end-to-end tests: the real app, but emails are captured and readable at `GET /e2e/emails?to=<address>`, and a Book can be added at `POST /e2e/books` (`testing/catalog-fixture-routes.ts`; it answers once search can find the Book). It is a separate entry point that `server.ts` never imports, listens on loopback only, and exits at once when `NODE_ENV=production`, so production cannot expose it (tests in `test/e2e-mailbox.test.ts`). `npm run e2e -w @libras/mobile` starts it.

## Audit log

`src/audit/` and the migration `supabase/migrations/20261112131200_audit_log.sql`. An append-only log of failed sign-ins (and, as they arrive, Loans, returns and Hold dispatches). Each entry stores a SHA-256 hash over its content and the previous entry's hash.

- **Record:** `createAuditLog(deps).record({ type, actorId?, subject?, data }, tx?)`. Time comes from `deps.clock`. Pass the client of a transaction (`withTransaction(deps.db, (tx) => ...)`) to record atomically with a change; record last in that transaction, because other writers of the log wait for it to end. The transaction must be READ COMMITTED (the default); the database refuses others.
- **Whitelist:** event types and the exact shape of `subject` and `data` are in `src/audit/events.ts` (strict objects, so an unlisted field such as a password cannot be recorded). The database has its own list, `public.audit_event_types`: a new type needs an entry in `events.ts` and an `insert` in a migration.
- **Chain:** the database, not the API, assigns the gapless `seq`, the `prev_hash` and the `hash` in a BEFORE INSERT trigger that holds an advisory lock until the transaction ends. Updates, deletes and TRUNCATE are refused by ENABLE ALWAYS triggers; `anon`, `authenticated` and `service_role` have no privileges, and row-level security is on with no policy.
- **Verify:** `createAuditLog(deps).verify({ anchor? })` recomputes every hash in TypeScript (`src/audit/canonical.ts`) and reports `content_changed`, `broken_link`, `missing_entry` or `anchor_mismatch` with the entry. From a terminal: `npm run audit:verify -w @libras/api` (local) or `npm run audit:verify:hosted -w @libras/api` (reads `.env.hosted`), optionally `-- --anchor <seq>:<hash>`.
- **Limits:** the table owner (the role migrations and the API use) can still ALTER or DROP the table or disable the triggers. Changes made that way are detected by verification, except removing the newest entries, or rewriting every entry from the changed one onwards; only a head (`seq:hash`) kept outside the database and passed as `anchor` detects those.
