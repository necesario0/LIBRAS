// Measurements and checks against the hosted system (issue #20): `npm run verify:hosted -- <command>`.
//
//   member     make the measurement Visitor (once) and save MEASURE_MEMBER_EMAIL / MEASURE_MEMBER_PASSWORD in .env.hosted
//   search     catalog search through the hosted API: one at a time, then 50 users at once (target 1.0 s)
//   dispatch   hold dispatch on the hosted database: the dispatch query at queue sizes up to 5,000 inside a transaction that is
//              rolled back, then the whole return -> Hold ready -> pickup path through the hosted API with test Members
//   cleanup    delete every test Member, Book, Copy, Loan and Hold the dispatch command made
//
// Everything reads .env.hosted (DATABASE_URL, SUPABASE_*, SEED_LIBRARIAN_*, EXPO_PUBLIC_API_URL). Nothing secret is printed.
// Test Members are made through the real sign-up code with a capturing email sender (no verification mail goes anywhere).
// The hosted API still sends the Hold-ready email when a Hold is dispatched, so the test Members' addresses are changed to
// a +alias of SEED_LIBRARIAN_EMAIL (the developer's own address): the only mail is the Hold-ready notices in that inbox.
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { tokenize } from "@libras/shared";
import { createApp } from "../src/app.ts";
import { SupabaseAuth } from "../src/auth/supabase-auth.ts";
import { SupabaseAuthAdmin } from "../src/auth/supabase-auth-admin.ts";
import { systemClock } from "../src/clock.ts";
import { loadConfig } from "../src/config.ts";
import { createDatabase, withTransaction } from "../src/db.ts";
import type { Database } from "../src/db.ts";
import { DISPATCH_SQL } from "../src/holds/dispatch.ts";
import { consoleLogger } from "../src/logger.ts";
import { generateCatalog } from "../src/seed/catalog-generator.ts";
import { CapturingEmailSender } from "../src/testing/capturing-email-sender.ts";
import { codeFromEmail, ntpEmployeeSignUpBody, facultySignUpBody, signInDirect, studentSignUpBody, visitorSignUpBody } from "../src/testing/members.ts";

const envFile = fileURLToPath(new URL("../../../.env.hosted", import.meta.url));
const TEST_EMAIL_PREFIX = "libras-hosted-check-";
const TEST_BOOK_TITLE = "ZZ Hosted Check Book (delete me)";
const TEST_BARCODE = "9900000001";
const TEST_ACCESSION = "HC-0000001";

const config = loadConfig();
if (!config.isProduction) throw new Error("This tool is for the hosted system: run it through npm run verify:hosted (it reads .env.hosted).");
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
if (!apiUrl.startsWith("https://")) throw new Error("EXPO_PUBLIC_API_URL must be the https address of the hosted API");

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function summarize(label: string, samples: number[], wallMs?: number, limitMs?: number): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const rate = wallMs === undefined ? "" : `  ${Math.round((samples.length / wallMs) * 1000)} req/s`;
  const within = limitMs === undefined ? "" : `  ${((sorted.filter((ms) => ms <= limitMs).length / sorted.length) * 100).toFixed(1)}% within ${limitMs} ms`;
  console.log(
    `${label.padEnd(30)} n=${String(samples.length).padStart(5)}  min ${(sorted[0] ?? 0).toFixed(1)}  p50 ${percentile(sorted, 50).toFixed(1)}  p95 ${percentile(sorted, 95).toFixed(1)}  p99 ${percentile(sorted, 99).toFixed(1)}  max ${(sorted.at(-1) ?? 0).toFixed(1)} ms${rate}${within}`,
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withTypos(rng: () => number, word: string, edits: number): string {
  let q = word;
  for (let e = 0; e < edits && q.length > 3; e++) {
    const i = Math.floor(rng() * q.length);
    const op = Math.floor(rng() * 3);
    const letter = "abcdefghijklmnopqrstuvwxyz"[Math.floor(rng() * 26)];
    if (op === 0) q = q.slice(0, i) + letter + q.slice(i + 1);
    else if (op === 1) q = q.slice(0, i) + q.slice(i + 1);
    else q = q.slice(0, i) + letter + q.slice(i);
  }
  return q;
}

/** A +alias of the developer's own address: mail to it lands in the developer's inbox. */
function developerAlias(tag: string): string {
  const own = process.env.SEED_LIBRARIAN_EMAIL;
  const at = own?.lastIndexOf("@") ?? -1;
  if (!own || at < 1) throw new Error("SEED_LIBRARIAN_EMAIL is not set in .env.hosted");
  return `${own.slice(0, at)}+${tag}${own.slice(at)}`;
}

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; ms: number; body: T }> {
  const start = performance.now();
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const parsed = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, ms: performance.now() - start, body: parsed };
}

/** The real API on this computer, against the hosted database and Supabase Auth, with a sender that only captures. It makes test Members. */
async function startSignUpApp(db: Database) {
  const email = new CapturingEmailSender();
  const { app, stop } = createApp({
    db,
    auth: new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey }),
    accounts: new SupabaseAuthAdmin({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
    clock: systemClock,
    email,
    logger: consoleLogger,
  });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  return {
    async signUp(body: { email: string; password: string } & Record<string, unknown>): Promise<void> {
      const post = (path: string, payload: unknown) => fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const started = await post("/members/sign-up", body);
      if (started.status !== 201) throw new Error(`Sign-up failed: ${started.status} ${await started.text()}`);
      const verified = await post("/members/sign-up/verify", { email: body.email, code: codeFromEmail(email.lastTo(body.email)) });
      if (verified.status !== 200 && verified.status !== 201) throw new Error(`Verification failed: ${verified.status} ${await verified.text()}`);
    },
    close: () =>
      new Promise<void>((resolve) => {
        stop();
        server.close(() => resolve());
      }),
  };
}

function appendEnv(lines: Record<string, string>): void {
  const existing = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  appendFileSync(envFile, `${existing === "" || existing.endsWith("\n") ? "" : "\n"}${Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
}

async function memberCommand(db: Database): Promise<void> {
  if (process.env.MEASURE_MEMBER_EMAIL && process.env.MEASURE_MEMBER_PASSWORD) {
    const token = await signInDirect(process.env.MEASURE_MEMBER_EMAIL, process.env.MEASURE_MEMBER_PASSWORD);
    console.log(token ? "The measurement Member exists and signs in." : "MEASURE_MEMBER_* is set but sign-in is refused.");
    return;
  }
  const email = developerAlias("libras-measure");
  const password = randomBytes(18).toString("base64url");
  const app = await startSignUpApp(db);
  try {
    await app.signUp(visitorSignUpBody({ email, password, firstName: "Measure", lastName: "Visitor", username: `measure_${randomUUID().slice(0, 8)}` }));
  } finally {
    await app.close();
  }
  appendEnv({ MEASURE_MEMBER_EMAIL: email, MEASURE_MEMBER_PASSWORD: password });
  console.log("Made the measurement Visitor and saved MEASURE_MEMBER_EMAIL and MEASURE_MEMBER_PASSWORD in .env.hosted. No email was sent.");
}

async function searchCommand(): Promise<void> {
  const email = process.env.MEASURE_MEMBER_EMAIL;
  const password = process.env.MEASURE_MEMBER_PASSWORD;
  if (!email || !password) throw new Error("Run `npm run verify:hosted -- member` first.");
  const token = await signInDirect(email, password);
  if (!token) throw new Error("The measurement Member could not sign in.");

  const books = generateCatalog().books;
  const rng = mulberry32(99);
  const words = books.flatMap((book) => [...tokenize(book.title), ...book.authors.flatMap(tokenize)]).filter((word) => word.length >= 5);
  const pickWord = () => words[Math.floor(rng() * words.length)] ?? "library";
  const pickBook = () => books[Math.floor(rng() * books.length)] ?? books[0];
  const kinds = ["exact word", "1 typo", "2 typos", "two words", "ISBN", "no match"];
  const queryOf = (kind: number): string => {
    if (kind === 0) return pickWord();
    if (kind === 1) return withTypos(rng, pickWord(), 1);
    if (kind === 2) return withTypos(rng, pickWord(), 2);
    if (kind === 3) return `${pickWord()} ${pickWord()}`;
    if (kind === 4) return pickBook()?.isbn ?? "9780000000000";
    return withTypos(rng, `${pickWord()}${pickWord()}`, 2);
  };
  const timed = async (query: string): Promise<number> => {
    const result = await call("GET", `/catalog/search?q=${encodeURIComponent(query)}`, token);
    if (result.status !== 200) throw new Error(`search failed with ${result.status}`);
    return result.ms;
  };

  console.log(`Hosted API ${new URL(apiUrl).host}, sample catalog of ${books.length} Books\n`);
  const woke = await call("GET", "/health");
  console.log(`wake-up /health: ${woke.ms.toFixed(0)} ms (status ${woke.status})`);
  const first = await timed("introduction");
  console.log(`first search: ${first.toFixed(0)} ms`);

  // The network floor between this computer and the service: a request the API answers without a database or a search.
  const floor: number[] = [];
  for (let i = 0; i < 30; i++) floor.push((await call("GET", "/no-such-route")).ms);
  console.log("");
  summarize("network floor (404)", floor);

  const sequentialKinds = kinds.map(() => [] as number[]);
  const sequential: number[] = [];
  for (let i = 0; i < 300; i++) {
    const kind = i % kinds.length;
    const ms = await timed(queryOf(kind));
    sequentialKinds[kind]?.push(ms);
    sequential.push(ms);
  }
  console.log("\none request at a time:");
  kinds.forEach((kind, i) => summarize(kind, sequentialKinds[i] ?? []));
  summarize("all", sequential, undefined, 1000);

  for (let run = 1; run <= 3; run++) {
    const concurrent: number[] = [];
    const started = performance.now();
    await Promise.all(
      Array.from({ length: 50 }, async () => {
        for (let round = 0; round < 12; round++) concurrent.push(await timed(queryOf(Math.floor(rng() * kinds.length))));
      }),
    );
    console.log(run === 1 ? "\n50 users at once, 12 searches each (3 runs):" : "");
    summarize(`run ${run}`, concurrent, performance.now() - started, 1000);
  }

  // The same 50 users the way patrons search: a pause of 2 to 5 seconds (typing, reading the results) between searches.
  const patient: number[] = [];
  const patientStarted = performance.now();
  await Promise.all(
    Array.from({ length: 50 }, async () => {
      for (let round = 0; round < 10; round++) {
        await new Promise((resolve) => setTimeout(resolve, 2000 + rng() * 3000));
        patient.push(await timed(queryOf(Math.floor(rng() * kinds.length))));
      }
    }),
  );
  console.log("\n50 users at once with 2 to 5 seconds between their searches (10 each):");
  summarize("patrons", patient, performance.now() - patientStarted, 1000);
}

/** The queue as the dispatch query sees it: `size` waiting Holds on one Book, all inside the caller's transaction. */
async function seedQueue(tx: PoolClient, size: number): Promise<{ bookId: string; copyId: string }> {
  const book = await tx.query<{ id: string }>("insert into public.books (title, authors) values ($1, '{}') returning id", [`${TEST_BOOK_TITLE} scale`]);
  const bookId = book.rows[0]?.id as string;
  const copy = await tx.query<{ id: string }>(
    "insert into public.copies (book_id, accession_number, barcode, status) values ($1, 'HC-SCALE-1', '9900000099', 'on_loan') returning id",
    [bookId],
  );
  await tx.query(
    `insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
     select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'scale-' || n || '@example.invalid', now(), now()
       from generate_series(1, $1::int) n`,
    [size],
  );
  await tx.query(
    `insert into public.members (user_id, account_type, first_name, last_name, username, terms_accepted_at)
     select id, 'visitor', 'Scale', 'Test', 'scale_' || row_number() over (), now()
       from auth.users where email like 'scale-%@example.invalid'`,
  );
  // A spread of roles and arrival times, as the real queue has: weights of 0, 12 and 24 hours.
  await tx.query(
    `insert into public.holds (book_id, member_id, status, placed_at, weight_hours, score)
     select $1, user_id, 'waiting', t, w, t - make_interval(hours => w)
       from (select user_id, now() - make_interval(secs => row_number() over () * 7) as t, (array[0, 12, 24])[1 + (row_number() over () % 3)::int] as w
               from public.members where username like 'scale\\_%') s`,
    [bookId],
  );
  return { bookId, copyId: copy.rows[0]?.id as string };
}

async function scaleDispatch(db: Database, size: number, repeats: number): Promise<void> {
  const wall: number[] = [];
  const server: number[] = [];
  let planNote = "";
  await withTransaction(db, async (tx) => {
    const { bookId, copyId } = await seedQueue(tx, size);
    await tx.query("analyze public.holds");
    const reset = () => tx.query("update public.holds set status = 'waiting', copy_id = null, ready_at = null, pickup_ends_at = null where status = 'ready'");
    for (let i = 0; i < repeats; i++) {
      const start = performance.now();
      const result = await tx.query(DISPATCH_SQL, [bookId, copyId, new Date()]);
      wall.push(performance.now() - start);
      if (result.rows.length !== 1) throw new Error("the dispatch query chose no Hold");
      await reset();
      const plan = await tx.query<{ "QUERY PLAN": string }>(`explain (analyze, timing on) ${DISPATCH_SQL}`, [bookId, copyId, new Date()]);
      const lines = plan.rows.map((row) => row["QUERY PLAN"]);
      const exec = /Execution Time: ([\d.]+) ms/.exec(lines.find((line) => line.startsWith("Execution Time")) ?? "")?.[1];
      server.push(Number(exec));
      if (i === 0) planNote = lines.some((line) => line.includes("holds_queue_idx")) ? "uses holds_queue_idx" : "DOES NOT use holds_queue_idx";
      await reset();
    }
    throw new RollBack();
  }).catch((error) => {
    if (!(error instanceof RollBack)) throw error;
  });
  console.log(`queue of ${String(size).padStart(5)} waiting Holds (${planNote}):`);
  summarize("  database execution time", server);
  summarize("  round trip from here", wall);
}

class RollBack extends Error {}

async function dispatchCommand(db: Database): Promise<void> {
  console.log("Part 1: the dispatch query on the hosted database (each size in a transaction that is rolled back; nothing is kept)\n");
  for (const size of [100, 1000, 5000]) await scaleDispatch(db, size, 100);

  console.log("\nPart 2: return -> Hold ready -> pickup through the hosted API, with test Members\n");
  await cleanup(db, false);
  const sender = await startSignUpApp(db);
  const password = randomBytes(12).toString("base64url");
  const stamp = randomUUID().slice(0, 6);
  const specs = [
    { key: "borrower", body: studentSignUpBody },
    { key: "student", body: studentSignUpBody },
    { key: "ntp", body: ntpEmployeeSignUpBody },
    { key: "faculty", body: facultySignUpBody },
  ] as const;
  const members: Record<string, { email: string; token: string; userId: string }> = {};
  try {
    for (const spec of specs) {
      const email = `${TEST_EMAIL_PREFIX}${spec.key}-${stamp}@umak.edu.ph`;
      await sender.signUp(spec.body({ email, password, firstName: `HostedCheck${spec.key}`, lastName: "Test" }) as never);
      const token = await signInDirect(email, password);
      if (!token) throw new Error(`The test Member ${spec.key} could not sign in`);
      const row = await db.query<{ id: string }>("select id from auth.users where email = $1", [email]);
      members[spec.key] = { email, token, userId: row.rows[0]?.id as string };
    }
  } finally {
    await sender.close();
  }
  // The hosted API mails the Member whose Hold becomes ready: send those to the developer's own inbox.
  for (const [key, member] of Object.entries(members)) {
    await db.query("update auth.users set email = $2 where id = $1", [member.userId, developerAlias(`${TEST_EMAIL_PREFIX}${key}`)]);
  }
  console.log("made 4 test Members (borrower, student, NTP / Employee, Faculty); Hold-ready mail goes to the developer's +alias");

  const book = await db.query<{ id: string }>("insert into public.books (title, authors) values ($1, '{}') returning id", [TEST_BOOK_TITLE]);
  const bookId = book.rows[0]?.id as string;
  await db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [bookId, TEST_ACCESSION, TEST_BARCODE]);

  const librarian = await call<{ session: { accessToken: string } }>("POST", "/staff/sign-in", undefined, {
    email: process.env.SEED_LIBRARIAN_EMAIL,
    password: process.env.SEED_LIBRARIAN_PASSWORD,
  });
  if (librarian.status !== 200) throw new Error(`Librarian sign-in failed: ${librarian.status}`);
  const librarianToken = librarian.body.session.accessToken;

  const digitalId = async (key: string): Promise<string> => {
    const result = await call<{ code: string }>("GET", "/members/me/digital-id", members[key]?.token);
    if (result.status !== 200) throw new Error(`Digital ID of ${key}: ${result.status}`);
    return result.body.code;
  };
  /** The Librarian scans the Member's Digital ID (a desk session starts), then the Copy, and is done. Only the Copy's scan is timed. */
  const lend = async (key: string) => {
    const identified = await call<{ deskSession: { token: string } }>("POST", "/desk/members/identify", librarianToken, { code: await digitalId(key) });
    if (identified.status !== 200) throw new Error(`Identifying ${key} failed: ${identified.status}`);
    const deskSession = identified.body.deskSession.token;
    const result = await call<{ error?: { code: string } }>("POST", "/desk/loans", librarianToken, { deskSession, copy: TEST_BARCODE });
    await call("POST", "/desk/sessions/end", librarianToken, { deskSession });
    if (result.status !== 201) throw new Error(`Lending to ${key} failed: ${result.status} ${result.body.error?.code}`);
    return result.ms;
  };
  const giveBack = async () => {
    const result = await call<{ loan: { heldFor: { memberName: string } | null } }>("POST", "/desk/returns", librarianToken, { copy: TEST_BARCODE });
    if (result.status !== 201 && result.status !== 200) throw new Error(`Return failed: ${result.status}`);
    return { ms: result.ms, heldFor: result.body.loan.heldFor?.memberName ?? null };
  };

  const withDispatch: number[] = [];
  const withoutDispatch: number[] = [];
  const lends: number[] = [];
  const holdPlacing: number[] = [];
  const expectedOrder = ["faculty", "ntp", "student"];
  const cycles = 3;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    lends.push(await lend("borrower"));
    for (const key of ["student", "ntp", "faculty"]) {
      const placed = await call<{ error?: { code: string } }>("POST", "/holds", members[key]?.token, { bookId });
      if (placed.status !== 201) throw new Error(`Hold of ${key} failed: ${placed.status} ${placed.body.error?.code}`);
      holdPlacing.push(placed.ms);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    for (const expected of expectedOrder) {
      const back = await giveBack();
      withDispatch.push(back.ms);
      const wanted = `HostedCheck${expected}`;
      if (!back.heldFor?.startsWith(wanted)) throw new Error(`Cycle ${cycle}: expected the Copy to be set aside for ${expected}, the desk said ${back.heldFor}`);
      lends.push(await lend(expected));
    }
    const last = await giveBack();
    if (last.heldFor !== null) throw new Error("The last return still found a Hold");
    withoutDispatch.push(last.ms);
    console.log(`cycle ${cycle}: Holds were served Faculty, then NTP / Employee, then Student (role-weighted order), Copy available again`);
  }
  console.log("");
  summarize("place a Hold", holdPlacing);
  summarize("return with Hold dispatch", withDispatch);
  summarize("return, nothing waiting", withoutDispatch);
  summarize("lend (confirm a Loan)", lends);
  console.log(`\n${withDispatch.length} Hold-ready emails were sent to the developer's +alias addresses.`);
  await cleanup(db, true);
}

async function cleanup(db: Database, say: boolean): Promise<void> {
  const users = await db.query<{ id: string }>("select id from auth.users where email like $1 or email like $2", [`${TEST_EMAIL_PREFIX}%`, `%+${TEST_EMAIL_PREFIX}%`]);
  const ids = users.rows.map((row) => row.id);
  const books = (await db.query<{ id: string }>("select id from public.books where title like $1", [`${TEST_BOOK_TITLE}%`])).rows.map((row) => row.id);
  await withTransaction(db, async (tx) => {
    await tx.query("delete from public.digital_id_uses where member_id = any($1)", [ids]);
    await tx.query("delete from public.loans where member_id = any($1) or copy_id in (select id from public.copies where book_id = any($2))", [ids, books]);
    await tx.query("delete from public.holds where member_id = any($1) or book_id = any($2)", [ids, books]);
    await tx.query("delete from public.copies where book_id = any($1)", [books]);
    await tx.query("delete from public.books where id = any($1)", [books]);
    await tx.query("delete from auth.users where id = any($1)", [ids]);
  });
  if (say) console.log(`Removed ${ids.length} test Members, ${books.length} test Book(s) and their Copies, Loans and Holds. The audit log keeps its entries.`);
}

const command = process.argv[2];
const db = createDatabase(config.databaseUrl, consoleLogger, config.databaseCaCertificate);
try {
  if (command === "member") await memberCommand(db);
  else if (command === "search") await searchCommand();
  else if (command === "dispatch") await dispatchCommand(db);
  else if (command === "cleanup") await cleanup(db, true);
  else throw new Error("Usage: npm run verify:hosted -- member | search | dispatch | cleanup");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.end();
}
