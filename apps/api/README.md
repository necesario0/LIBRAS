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
| `src/testing/` | The HTTP test harness, also exported as `@libras/api/testing`, and the end-to-end server `e2e-server.ts` |
| `test/` | Tests, `*.test.ts`, run with Node's built-in test runner |

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
- Test files run one at a time (`--test-concurrency=1`) because they share one database.

## Test helpers for Members

```ts
import { createTestMember, studentSignUpBody, codeFromEmail, signInDirect } from "@libras/api/testing";

const ana = await createTestMember(api, { firstName: "Ana" }); // signs up, reads the emailed code, verifies, signs in
ana.member;      // MemberProfile
ana.accessToken; // Authorization: Bearer <accessToken>
```

`studentSignUpBody()` is a valid UMAK Student sign-up with a unique email, username and student number. `codeFromEmail(api.emails.lastTo(email))` reads the verification code. `createTestAccount(api)` makes a bare Supabase account (no Member profile) and, with `{ staff }`, a Librarian.

## The end-to-end API

`src/testing/e2e-server.ts` is the API for end-to-end tests: the real app, but emails are captured and readable at `GET /e2e/emails?to=<address>`. It is a separate entry point that `server.ts` never imports, listens on loopback only, and exits at once when `NODE_ENV=production`, so production cannot expose it (tests in `test/e2e-mailbox.test.ts`). `npm run e2e -w @libras/mobile` starts it.
