# LIBRAS

The library system for the University of Makati: Members find and borrow physical books, and Librarians run circulation. The vocabulary is in [`GLOSSARY.md`](GLOSSARY.md) and the decisions are in [`docs/adr/`](docs/adr/).

## Layout

One repository, npm workspaces.

| Path | Package | Contents |
| --- | --- | --- |
| `apps/api` | `@libras/api` | The API: Node.js, Express and TypeScript, backed by Supabase PostgreSQL |
| `apps/mobile` | `@libras/mobile` | The Member mobile app (React Native with Expo). Placeholder for now |
| `apps/web` | `@libras/web` | The Librarian desk page (and, later, the phone scanner page). Vite and React |
| `packages/shared` | `@libras/shared` | Types, validation schemas and the search module shared by the API and the clients |
| `benchmarks` | `libras-algorithm-benchmarks` | The algorithm benchmark prototypes behind ADR 0001 |
| `supabase` | | Local Supabase configuration and database migrations |

## Requirements

- Node.js 22.18 or newer (24 is used in CI, see `.node-version`). TypeScript files run directly, there is no build step.
- Docker, running. The local database is the Supabase stack in Docker containers.

## Run the API locally

```bash
npm install
npm run dev
```

`npm run dev` starts the local Supabase PostgreSQL and then the API on http://localhost:3000, restarting it when a file changes. The first run downloads the Supabase Docker images, which takes a few minutes. Check that it works:

```bash
curl http://localhost:3000/health
# {"status":"ok","database":"ok","time":"2026-11-11T10:32:44.604Z"}
```

No `.env` file is needed locally. To change the port or the database, copy `.env.example` to `.env` and edit it.

No Supabase key lives in the source. `npm run dev`, `npm test`, `npm run test:api`, `npm run seed` and `npm run test:e2e` read `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from the running local stack (`npx supabase status -o env`, through `apps/api/scripts/with-local-supabase.ts`), so the database must be started first with `npm run db:start`. A variable you set yourself, in the environment or in `.env`, wins, and nothing is looked up when `NODE_ENV=production`: production sets all three explicitly. To run a one-off command the same way: `node apps/api/scripts/with-local-supabase.ts <command>`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the database and the API |
| `npm run db:start` | Start only the local Supabase stack (safe to run when it is already up) |
| `npm run db:status` | Show the local Supabase URLs and keys |
| `npm run db:reset` | Recreate the local database from `supabase/migrations` |
| `npm run db:stop` | Stop the local Supabase stack |
| `npm run seed` | Create the demo Librarian (`librarian@libras.test`, local only). Safe to run again |

## Run the tests and checks locally

The API tests send real HTTP requests to the API running against the real local PostgreSQL, so start the database first.

```bash
npm run db:start
npm test              # every package: the API tests and the benchmark tests
npm run test:api      # only the API tests
npm run test:benchmarks
npm run test:e2e      # the desk page in Chrome against the real API (needs Chrome installed)
npm run typecheck
npm run lint
npm run check         # typecheck, lint and tests together, the same as CI
```

Tests use Node's built-in test runner. In an API test, `startTestApi()` from `apps/api/src/testing` starts the API on a free port with a clock the test controls and an email sender that captures messages instead of sending them. See [`apps/api/README.md`](apps/api/README.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main` and `spec-*` branches: typecheck, lint, tests against a local Supabase PostgreSQL, secret scanning with gitleaks over the full history, and static code scanning with CodeQL.

To run the secret scan locally:

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact --no-banner
```
