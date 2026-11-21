// Prepares the local database for the live presentation demo:
//
//   npm run demo:prepare         creates the demo accounts and puts Books X, Y and Z in demo state
//   npm run demo:reset           clears only the demo accounts' Loans, Holds and Fines and restores X, Y and Z
//
// Local only: refuses to run against production. Never touches the catalog or the audit log.
// Safe to run again: if the accounts and demo state already exist, it prints the summary without changing them.
import type { Server } from "node:http";
import type {
  ConfirmLoanResponse,
  DigitalIdResponse,
  IdentifyMemberResponse,
  PlaceHoldResponse,
  SignUpRequest,
  StaffSignInResponse,
} from "@libras/shared";
import { createApp } from "../src/app.ts";
import { announcementFiles } from "../src/announcements/storage.ts";
import { createAuditLog } from "../src/audit/index.ts";
import { SupabaseAuth } from "../src/auth/supabase-auth.ts";
import { SupabaseAuthAdmin } from "../src/auth/supabase-auth-admin.ts";
import { systemClock } from "../src/clock.ts";
import { loadConfig } from "../src/config.ts";
import { createDatabase, withTransaction } from "../src/db.ts";
import type { Database } from "../src/db.ts";
import { consoleLogger } from "../src/logger.ts";
import { CapturingEmailSender } from "../src/testing/capturing-email-sender.ts";
import { CapturingPushSender } from "../src/testing/capturing-push-sender.ts";
import { codeFromEmail, signInDirect } from "../src/testing/members.ts";

const LIBRARIAN_EMAIL = "librarian@libras.test";
const LIBRARIAN_PASSWORD = "librarian-demo-2026";

/** Deterministic Copy barcodes from the seeded sample catalog (DEFAULT_CATALOG_SEED = 20261112). */
const DEMO_BOOKS = {
  /** Book X: 1 Copy, on Loan to NTP N; Student S holds first, then Faculty F (<24 h apart). */
  X: { barcode: "3100032532", isbn: "9787241132233", label: "Book X (Hold dispatch return)" },
  /** Book Y: 3 available Copies; top result for typo search "algoritms aquino". */
  Y: { barcode: "3100001370", isbn: "9785422160334", label: "Book Y (Live search and borrow)" },
  /** Book Z: 1 Copy, on Loan to NTP N and backdated 10 days (3 days late = PHP 15 Fine). */
  Z: { barcode: "3100042685", isbn: "9780925974303", label: "Book Z (Backdated 10 days for Fine Q&A)" },
} as const;

const BACKDATE_DAYS = 10;

interface DemoAccount {
  readonly roleLabel: string;
  readonly body: SignUpRequest & { email: string; password: string };
}

const DEMO_ACCOUNTS: Readonly<Record<"faculty" | "student" | "ntp", DemoAccount>> = {
  faculty: {
    roleLabel: "Faculty (F)",
    body: {
      accountType: "faculty",
      email: "faculty.demo@umak.edu.ph",
      password: "DemoFaculty2026!",
      firstName: "Maria",
      lastName: "Santos",
      username: "prof_santos",
      details: { facultyNumber: "F2026001", college: "CCIS" },
      acceptedTerms: true,
    },
  },
  student: {
    roleLabel: "UMAK Student (S)",
    body: {
      accountType: "umak_student",
      email: "student.demo@umak.edu.ph",
      password: "DemoStudent2026!",
      firstName: "Juan",
      lastName: "Reyes",
      username: "juan_reyes",
      details: { studentNumber: "K12345678", college: "CCIS" },
      acceptedTerms: true,
    },
  },
  ntp: {
    roleLabel: "NTP / Employee (N)",
    body: {
      accountType: "ntp_employee",
      email: "ntp.demo@umak.edu.ph",
      password: "DemoNtp2026!",
      firstName: "Elena",
      lastName: "Cruz",
      username: "elena_cruz",
      details: { employeeNumber: "E2026001", college: "CCIS" },
      acceptedTerms: true,
    },
  },
};

interface CopyInfo {
  copyId: string;
  bookId: string;
  barcode: string;
  accessionNumber: string;
  status: string;
  title: string;
  authors: string[];
  copyCount: number;
}

async function call<T>(baseUrl: string, method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function lookupCopy(db: Database, barcode: string): Promise<CopyInfo> {
  const result = await db.query<{
    copy_id: string;
    book_id: string;
    barcode: string;
    accession_number: string;
    status: string;
    title: string;
    authors: string[];
    copy_count: string;
  }>(
    `select c.id as copy_id, c.book_id, c.barcode, c.accession_number, c.status, b.title, b.authors,
            (select count(*) from public.copies c2 where c2.book_id = b.id)::text as copy_count
       from public.copies c
       join public.books b on b.id = c.book_id
      where c.barcode = $1`,
    [barcode],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Copy ${barcode} was not found. Seed the synthetic catalog first: npm run seed -w @libras/api '--' --sample-catalog`);
  }
  return {
    copyId: row.copy_id,
    bookId: row.book_id,
    barcode: row.barcode,
    accessionNumber: row.accession_number,
    status: row.status,
    title: row.title,
    authors: row.authors,
    copyCount: Number(row.copy_count),
  };
}

async function ensureMember(
  db: Database,
  baseUrl: string,
  emailSender: CapturingEmailSender,
  account: DemoAccount,
): Promise<{ userId: string; accessToken: string }> {
  const existing = await db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [account.body.email]);
  if (existing.rows.length === 0) {
    await call(baseUrl, "POST", "/members/sign-up", undefined, account.body);
    const code = codeFromEmail(emailSender.lastTo(account.body.email));
    await call(baseUrl, "POST", "/members/sign-up/verify", undefined, { email: account.body.email, code });
    console.log(`Created ${account.roleLabel}: ${account.body.email}`);
  } else {
    console.log(`Account exists (${account.roleLabel}): ${account.body.email}`);
  }
  const userRow = await db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [account.body.email]);
  const userId = userRow.rows[0]?.id;
  if (!userId) throw new Error(`Account ${account.body.email} could not be read back from auth.users`);
  const accessToken = await signInDirect(account.body.email, account.body.password);
  if (!accessToken) throw new Error(`Account ${account.body.email} could not sign in`);
  return { userId, accessToken };
}

async function isDemoReady(
  db: Database,
  bookX: CopyInfo,
  bookY: CopyInfo,
  bookZ: CopyInfo,
  ids: { faculty: string; student: string; ntp: string },
): Promise<boolean> {
  if (bookX.status !== "on_loan" || bookZ.status !== "on_loan") return false;
  const yAvail = await db.query<{ count: string }>("select count(*)::text as count from public.copies where book_id = $1 and status = 'available'", [
    bookY.bookId,
  ]);
  if (Number(yAvail.rows[0]?.count ?? 0) < 1) return false;

  const openLoans = await db.query<{ copy_id: string; member_id: string; due_at: Date }>(
    "select copy_id, member_id, due_at from public.loans where returned_at is null and copy_id = any($1)",
    [[bookX.copyId, bookZ.copyId]],
  );
  const loanX = openLoans.rows.find((row) => row.copy_id === bookX.copyId && row.member_id === ids.ntp);
  const loanZ = openLoans.rows.find((row) => row.copy_id === bookZ.copyId && row.member_id === ids.ntp && row.due_at.getTime() < Date.now());
  if (!loanX || !loanZ) return false;

  const facultyLoans = await db.query<{ count: string }>("select count(*)::text as count from public.loans where member_id = $1 and returned_at is null", [
    ids.faculty,
  ]);
  const facultyFines = await db.query<{ count: string }>(
    "select count(*)::text as count from public.fines where member_id = $1 and settled_at is null",
    [ids.faculty],
  );
  if (Number(facultyLoans.rows[0]?.count ?? 0) >= 3 || Number(facultyFines.rows[0]?.count ?? 0) > 0) return false;

  const holds = await db.query<{ member_id: string; status: string }>(
    "select member_id, status from public.holds where book_id = $1 and status = 'waiting' order by score, seq",
    [bookX.bookId],
  );
  if (holds.rows.length !== 2) return false;
  return holds.rows[0]?.member_id === ids.faculty && holds.rows[1]?.member_id === ids.student;
}

async function resetDemoTransactions(db: Database, demoMemberIds: readonly string[], demoBookIds: readonly string[]): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.query("delete from public.digital_id_uses where member_id = any($1)", [demoMemberIds]);
    await tx.query("delete from public.notifications where member_id = any($1)", [demoMemberIds]);
    await tx.query("delete from public.holds where member_id = any($1) or book_id = any($2)", [demoMemberIds, demoBookIds]);
    await tx.query(
      "delete from public.loans where member_id = any($1) or copy_id in (select id from public.copies where book_id = any($2))",
      [demoMemberIds, demoBookIds],
    );
    await tx.query("update public.copies set status = 'available' where book_id = any($1)", [demoBookIds]);
  });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const shouldReset = args.has("--reset");
  const config = loadConfig();
  if (config.isProduction) {
    throw new Error("This script is for the local demo database only. Refusing to run in production.");
  }

  const db = createDatabase(config.databaseUrl, console, config.databaseCaCertificate);
  const emailSender = new CapturingEmailSender();
  const { app, stop } = createApp({
    db,
    auth: new SupabaseAuth({ url: config.supabaseUrl, publishableKey: config.supabasePublishableKey }),
    accounts: new SupabaseAuthAdmin({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
    clock: systemClock,
    email: emailSender,
    logger: consoleLogger,
    files: announcementFiles(config),
    push: new CapturingPushSender(),
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  try {
    const bookX = await lookupCopy(db, DEMO_BOOKS.X.barcode);
    const bookY = await lookupCopy(db, DEMO_BOOKS.Y.barcode);
    const bookZ = await lookupCopy(db, DEMO_BOOKS.Z.barcode);
    if (bookX.copyCount !== 1) throw new Error(`Book X (${bookX.barcode}) must have exactly 1 Copy, found ${bookX.copyCount}`);

    const faculty = await ensureMember(db, baseUrl, emailSender, DEMO_ACCOUNTS.faculty);
    const student = await ensureMember(db, baseUrl, emailSender, DEMO_ACCOUNTS.student);
    const ntp = await ensureMember(db, baseUrl, emailSender, DEMO_ACCOUNTS.ntp);

    const memberIds = { faculty: faculty.userId, student: student.userId, ntp: ntp.userId };
    const ready = await isDemoReady(db, bookX, bookY, bookZ, memberIds);

    if (ready && !shouldReset) {
      console.log("Demo state is already ready. Run with --reset (npm run demo:reset) after a rehearsal to restore it.");
    } else {
      if (shouldReset || !ready) {
        await resetDemoTransactions(db, [faculty.userId, student.userId, ntp.userId], [bookX.bookId, bookY.bookId, bookZ.bookId]);
      }

      const staffSignIn = await call<StaffSignInResponse>(baseUrl, "POST", "/staff/sign-in", undefined, {
        email: LIBRARIAN_EMAIL,
        password: LIBRARIAN_PASSWORD,
      });
      const librarianToken = staffSignIn.session.accessToken;

      const ntpDigitalId = await call<DigitalIdResponse>(baseUrl, "GET", "/members/me/digital-id", ntp.accessToken);
      const desk = await call<IdentifyMemberResponse>(baseUrl, "POST", "/desk/members/identify", librarianToken, {
        code: ntpDigitalId.code,
      });

      await call<ConfirmLoanResponse>(baseUrl, "POST", "/desk/loans", librarianToken, {
        deskSession: desk.deskSession.token,
        copy: bookX.barcode,
      });
      await call<ConfirmLoanResponse>(baseUrl, "POST", "/desk/loans", librarianToken, {
        deskSession: desk.deskSession.token,
        copy: bookZ.barcode,
      });
      await call(baseUrl, "POST", "/desk/sessions/end", librarianToken, { deskSession: desk.deskSession.token });

      await call<PlaceHoldResponse>(baseUrl, "POST", "/holds", student.accessToken, { bookId: bookX.bookId });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await call<PlaceHoldResponse>(baseUrl, "POST", "/holds", faculty.accessToken, { bookId: bookX.bookId });

      await withTransaction(db, async (tx) => {
        const current = await tx.query<{ id: string; member_id: string; due_at: Date }>(
          `select l.id, l.member_id, l.due_at
             from public.loans l
             join public.copies c on c.id = l.copy_id
            where c.barcode = $1 and l.returned_at is null
              for update of l`,
          [bookZ.barcode],
        );
        const openLoan = current.rows[0];
        if (!openLoan) throw new Error(`Book Z (${bookZ.barcode}) has no open Loan to backdate`);
        const moved = await tx.query<{ due_at: Date }>(
          `update public.loans
              set checked_out_at = checked_out_at - make_interval(days => $2),
                  due_at = due_at - make_interval(days => $2)
            where id = $1
            returning due_at`,
          [openLoan.id, BACKDATE_DAYS],
        );
        const dueAt = moved.rows[0]?.due_at.toISOString();
        if (!dueAt) throw new Error(`Book Z (${bookZ.barcode}) could not be backdated`);
        await createAuditLog({ db, clock: systemClock }).record(
          {
            type: "loan_backdated",
            subject: openLoan.id,
            data: {
              memberId: openLoan.member_id,
              barcode: bookZ.barcode,
              days: BACKDATE_DAYS,
              previousDueAt: openLoan.due_at.toISOString(),
              dueAt,
            },
          },
          tx,
        );
      });
      console.log("Demo state prepared cleanly.");
    }

    const holds = await db.query<{ seq: string; account_type: string; placed_at: Date; weight_hours: number; score: Date }>(
      `select h.seq::text, m.account_type, h.placed_at, h.weight_hours, h.score
         from public.holds h
         join public.members m on m.user_id = h.member_id
        where h.book_id = $1 and h.status = 'waiting'
        order by h.score, h.seq`,
      [bookX.bookId],
    );
    const verification = await createAuditLog({ db, clock: systemClock }).verify();
    if (!verification.intact) {
      throw new Error(`Audit log check failed at entry ${verification.problem.seq}: ${verification.problem.message}`);
    }

    console.log("\n--- Demo Accounts ---");
    console.log(`  Librarian         : ${LIBRARIAN_EMAIL} / ${LIBRARIAN_PASSWORD}`);
    for (const account of Object.values(DEMO_ACCOUNTS)) {
      console.log(`  ${account.roleLabel.padEnd(18)}: ${account.body.email} / ${account.body.password} (${account.body.firstName} ${account.body.lastName})`);
    }
    console.log("\n--- Demo Books ---");
    console.log(`  Book X (Hold return) : ${bookX.barcode} (${bookX.accessionNumber}) - ${bookX.title} by ${bookX.authors.join("; ")} [1 copy, on Loan to N]`);
    console.log(`  Book Y (Live borrow) : ${bookY.barcode} (${bookY.accessionNumber}) - ${bookY.title} by ${bookY.authors.join("; ")} [3 copies available]`);
    console.log(`  Book Z (Backdated)   : ${bookZ.barcode} (${bookZ.accessionNumber}) - ${bookZ.title} by ${bookZ.authors.join("; ")} [1 copy, on Loan to N, -${BACKDATE_DAYS}d]`);
    console.log("\n--- Book X Hold Queue (ordered by score, seq) ---");
    for (const row of holds.rows) {
      console.log(`  seq=${row.seq}  ${row.account_type.padEnd(13)} placed=${row.placed_at.toISOString()}  weight=${row.weight_hours}h  score=${row.score.toISOString()}`);
    }
    console.log(`\nAudit log intact: ${verification.checked} entries checked.`);
  } finally {
    await new Promise<void>((resolve) => {
      stop();
      server.close(() => resolve());
    });
    await db.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
