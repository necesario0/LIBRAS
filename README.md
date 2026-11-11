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

## Deployment (Supabase, Render, Brevo)

The hosted system is three services, all on free tiers (ADR 0003):

| Service | Role | Why this one |
| --- | --- | --- |
| Supabase | PostgreSQL and Supabase Auth | Chosen in ADR 0003. Row-level security lives in the same database as the identities |
| Render | The API (`render.yaml`, a free web service in Singapore) | Chosen in ADR 0003. Node runs the TypeScript directly, so there is no build step |
| Brevo | Email (verification codes, Hold-ready notices) | See below |

**Why Brevo.** Render's free web services block outbound SMTP (ports 25, 465, 587), so the API sends email through an HTTPS API (`BrevoEmailSender` in `apps/api/src/email.ts`). The alternative, Resend, can send from its test address only to the account owner's own email until a domain you own is verified, which cannot work for sign-up codes sent to arbitrary Members. Brevo's free plan (about 300 emails a day) lets you verify a single sender address (you click a link or enter a code sent to that mailbox) and then sends to any recipient, with no domain needed. The limit to know about: mail sent "from" an address on a free mail domain such as gmail.com cannot be authenticated for that domain, so it may land in spam. Use a sender address on a domain you control (for example a UMAK address), and for the best delivery authenticate that domain in Brevo later (SPF and DKIM records), which needs access to its DNS.

### The commands

| Command | What it does |
| --- | --- |
| `npm run setup:hosted` | The guided setup wizard (`scripts/setup-hosted.sh`). Opens each dashboard, asks for each value, writes `.env.hosted` and the GitHub secrets, applies the migrations, creates the Librarian, checks the API and sends a test email |
| `npm run db:migrate:hosted` | Applies `supabase/migrations` to the hosted database. It first lists the pending migrations and asks you to type `apply`. `-- --dry-run` only lists them. `-- --yes` skips the question. Safe to run again |
| `npm run seed:hosted` | Creates (or resets) the Librarian from `SEED_LIBRARIAN_EMAIL` and `SEED_LIBRARIAN_PASSWORD` in `.env.hosted`. Later seed steps (catalog, Loan Policy) run here too |
| `npm run check:hosted` | Asks the hosted API for `/health` until it answers (up to five minutes, to cover Render waking up) |
| `npm run email:test -- you@example.com` | Sends one real email through Brevo |
| `npm run build:apk:hosted -w @libras/mobile` | Builds the release APK against the hosted API (about 25 minutes) |

Hosted settings live in `.env.hosted` at the repository root. It is gitignored and is never the same file as `.env`, because the local scripts and tests read `.env` and must keep using the local Supabase. Every name in it is listed in `.env.example`. No secret is ever committed: `render.yaml` holds names only, and secrets are typed or pasted in the dashboards.

### The settings

| Name | Where it comes from | Render service | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Supabase: Connect, Session pooler, password filled in | yes | The pooler works over IPv4. The direct connection is IPv6 only. The API connects over TLS (encrypted; set `DATABASE_CA_CERT` to the Supabase CA certificate to verify it too) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase: Project Settings, API Keys | yes | |
| `SUPABASE_SECRET_KEY` | the same page | no | Only scripts (seed) use it. The running API never gets it |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` | Brevo: SMTP & API keys, and a verified sender | yes | Production refuses to start without them |
| `CORS_ALLOWED_ORIGINS` | you | optional | See the CORS decision below |
| `EXPO_PUBLIC_API_URL` | the Render service address | no | Used by `build:apk:hosted` and `check:hosted` |

### Web pages and CORS

The mobile app is not a browser, so it needs no CORS. A hosted Librarian web page would be a different origin from the API, so the API has an allowlist: `CORS_ALLOWED_ORIGINS` is a comma separated list of exact origins (for example `https://libras-desk.onrender.com`). A listed origin gets the CORS headers, including for the preflight request; any other origin gets none. There is no wildcard and no cookie support: the clients send a bearer token. The default is an empty list, which is right until `apps/web` is hosted. To host it later, make a Render static site that runs `npm ci && npm run build -w @libras/web` with `VITE_API_URL` set to the API address, then add the site's origin to `CORS_ALLOWED_ORIGINS` in the Render dashboard.

### What a free Render service does

It goes to sleep after 15 minutes without traffic and takes about a minute to wake on the next request, and the mobile app gives up after 10 seconds. Before a demo run `npm run check:hosted` a few minutes ahead (and once more just before), which wakes it and confirms it is healthy.

### Human checklist

Do these in order, from the repository root, in Git Bash.

1. **Get this work onto GitHub `main`.** Render builds from GitHub, and `render.yaml` must be on the `main` branch there. Merge the deployment work (branch `spec-2/6-setup-deploy`, or `spec-2-tier1` once it contains it) into `main` and push. Until then the wizard warns at the Render stage and you can stop and resume.
2. **Prepare the computer.** `npm ci`. Then `gh auth login` if `gh auth status` says you are signed out (the wizard needs it to store GitHub secrets). Docker is not needed for this.
3. **Run the wizard:** `npm run setup:hosted`. It has eight stages and can be stopped with Ctrl-C and run again: it remembers what it saved in `.env.hosted`. What you will do in each stage:
   1. *Check this computer.* Nothing to do. It stops if `.env.hosted` is not gitignored.
   2. *Supabase* (https://supabase.com/dashboard/new, opened for you).
      - Sign in with GitHub. New project: name `libras`, region **Southeast Asia (Singapore)**, plan Free. Click **Generate a password** and **copy it before you click Create** (it is shown once).
      - Wait about two minutes for the project to finish. Copy the project URL from the browser address bar: `https://<id>.supabase.co`, and paste it into the wizard.
      - Project Settings (gear icon) > **API Keys**: paste the Publishable key (`sb_publishable_...`), then reveal and paste the Secret key (`sb_secret_...`, hidden as you type). The wizard checks both against Supabase.
      - Click the green **Connect** button at the top, choose **Session pooler** (not Direct connection), copy the connection string as it is (it contains `[YOUR-PASSWORD]`), paste it, then paste the database password you copied. The wizard builds the final string.
   3. *Brevo* (https://app.brevo.com, opened for you).
      - Sign up and finish the onboarding questions.
      - Add a sender: top-right menu > **Senders, Domains & Dedicated IPs** > **Senders** > **Add a sender**. Use an address you can open (a UMAK address is better than Gmail for delivery). Brevo emails it a code or link: confirm it. Wait until it shows as verified.
      - **SMTP & API** > **API keys** > **Generate a new API key**, name `libras-api`, copy it (`xkeysib-...`), paste it into the wizard (hidden), then type the verified sender address.
      - Security > **Authorized IPs**: make sure blocking of unknown IP addresses is **deactivated** (Render's addresses change, so a blocked IP would break sending in production only).
   4. *Database and Librarian.* The wizard runs `npm run db:migrate:hosted`: it lists the pending migrations and asks you to type `apply`. Then give the Librarian email and a password of 12 or more characters (hidden). This is the account used on the desk page.
   5. *Render* (https://dashboard.render.com/blueprint/new, opened for you).
      - Sign up with GitHub. Connect the repository `necesario0/LIBRAS`, branch `main`, Blueprint name `libras`.
      - Render asks for five values. The wizard puts each one on your clipboard in turn: click the field, press Ctrl+V, press Enter in the wizard. In order: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`. (`SUPABASE_SECRET_KEY` is not given to Render on purpose.)
      - Click **Deploy Blueprint**. Pick the free plan if it offers a choice. Open the `libras-api` service and copy its address (`https://libras-api-....onrender.com`) into the wizard.
   6. *Checks.* When Render's Events tab says the deploy is Live, press Enter: the wizard asks the API for `/health` (waits up to five minutes). Then give your own email address: a real test email is sent. Check the inbox and spam folder and answer yes.
   7. *GitHub secrets.* Answer yes. It stores `HOSTED_DATABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `BREVO_API_KEY` as repository secrets and `SUPABASE_URL`, `EMAIL_FROM_ADDRESS`, `HOSTED_API_URL` as variables. The current CI does not read them yet.
   8. *APK.* Say yes to build now (about 25 minutes) or no to do it later.
4. **Build the APK later, if you said no:** `npm run build:apk:hosted -w @libras/mobile`. It checks `/health` first and refuses an address that is not `https://`. The result is `apps/mobile/build/libras.apk`.
5. **Install and look:** start an emulator or plug in a phone, `adb install -r apps/mobile/build/libras.apk`, open the app. The first screen shows the health result: it should say the service is OK. If the API was asleep it can take a minute: run `npm run check:hosted` first to wake it, then reopen the app.
6. **Note the Render service address** and tick the acceptance criteria of the deployment issue: the hosted API answers `/health`, a real email arrived, and the APK shows the health result.

To do any part by hand: `npm run db:migrate:hosted`, `npm run seed:hosted`, `npm run check:hosted`, `npm run email:test -- you@example.com`. All read `.env.hosted`.

If something fails: Render service > **Logs** (API problems), Brevo > **Transactional** > **Logs** (email), Supabase > **Logs** (database). Never paste keys into a chat or an issue.
