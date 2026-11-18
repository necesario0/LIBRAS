// The checks `npm run verify:hosted` runs through the hosted API, kept apart from its command line so that
// `test/hosted-tier2-check.test.ts` can run the same walk against the API on this computer.
//
// Everything the checks make is marked: test Members have an address that starts with TEST_EMAIL_PREFIX (or a
// +alias with it), test Books a title that starts with TEST_BOOK_TITLE. `cleanupHostedChecks` deletes exactly those.
import { randomInt, randomUUID } from "node:crypto";
import type {
  ClearanceResponse,
  ConfirmLoanResponse,
  DigitalIdResponse,
  IdentifyMemberResponse,
  Loan,
  MyLoansResponse,
  PasswordResetRequestedResponse,
  RecordReturnResponse,
  RenewLoanResponse,
  SettleFineResponse,
} from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { systemClock } from "../src/clock.ts";
import type { Clock } from "../src/clock.ts";
import type { Database } from "../src/db.ts";
import { withTransaction } from "../src/db.ts";

export const TEST_EMAIL_PREFIX = "libras-hosted-check-";
export const TEST_BOOK_TITLE = "ZZ Hosted Check Book (delete me)";

const DAY_MS = 24 * 3_600_000;
/** How many days overdue the check makes its overdue Loan. */
const DAYS_LATE = 3;

/** The Tier 2 check's steps, in the order it runs them. Each prints one "ok" line. */
export const TIER2_STEPS = [
  "Lend three Copies at the desk",
  "My Loans has the Tier 2 fields (renewal, renewalCount, fine)",
  "Renewal moves the due date by one loan period, up to the renewal limit",
  "An overdue Loan shows its Fine so far",
  "Clearance and Good standing name the overdue Loan",
  "A Hold, a Renewal and a Loan are refused for the overdue Loan",
  "The sweep endpoint answers { expired, noticeEmails }",
  "A late return fixes the Fine",
  "Clearance and Good standing name the unsettled Fine",
  "A Loan is refused for the unsettled Fine, then lent in the same visit after the Fine is settled",
  "The Member is cleared and in Good standing again, and My Loans shows the Fine as paid",
  "A password reset request gets the neutral reply",
  "The audit log has the Renewal, the Fine and the settlement, and its chain is intact",
] as const;
export type Tier2Step = (typeof TIER2_STEPS)[number];

export interface Tier2CheckDeps {
  /** The API's address, with no trailing slash. */
  apiUrl: string;
  /** The API's database, as the API reads it. Used to add the test Book, to make one Loan overdue and to verify the audit chain. */
  db: Database;
  /** A signed-in Librarian. */
  librarianToken: string;
  /** A fresh UMAK Student (or another borrowing Account Type) with no Loans, Fines or Holds, signed in. */
  member: { accessToken: string; userId: string };
  /** The secret of `POST /internal/sweeps/pickup-expiry`. */
  sweepSecret: string;
  log: (line: string) => void;
}

export interface Tier2Report {
  passed: Tier2Step[];
  /** The Fine the late return fixed, in centavos. */
  fineCentavos: number;
}

class CheckFailed extends Error {}

interface Answer<T> {
  status: number;
  body: T;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Walks Tier 2 through the API, as the app and the desk page call it: Renewal, the Loans list, a Fine on a late
 * return and its settlement in a desk session, Clearance, the Good standing refusals, the neutral password reset
 * reply and the sweep endpoint, then checks the audit log. Stops at the first step the API gets wrong, with an
 * error that starts with the step's name. It leaves its test Book, Loans and Fine behind for `cleanupHostedChecks`.
 *
 * It sends no email of its own: the reset request is for an address with no account. The sweep it calls is the one
 * the database's schedule calls every few minutes, so it may send the Loan notices that were due anyway, among
 * them an overdue notice to the test Member.
 */
export async function checkTier2(deps: Tier2CheckDeps): Promise<Tier2Report> {
  const { db, member, librarianToken } = deps;
  const passed: Tier2Step[] = [];
  let current: Tier2Step = TIER2_STEPS[0];

  const call = async <T>(method: string, path: string, token?: string, body?: unknown): Promise<Answer<T & ErrorBody>> => {
    const response = await fetch(`${deps.apiUrl}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as T & ErrorBody };
  };
  const fail = (detail: string): never => {
    throw new CheckFailed(`${current} - FAILED: ${detail}`);
  };
  const expect = (condition: boolean, detail: string): void => {
    if (!condition) fail(detail);
  };
  const expectStatus = <T>(answer: Answer<T & ErrorBody>, status: number, what: string): T & ErrorBody => {
    expect(answer.status === status, `${what} answered ${answer.status} ${answer.body.error?.code ?? ""}, expected ${status}`);
    return answer.body;
  };
  const expectRefused = (answer: Answer<ErrorBody>, code: string, what: string): void => {
    expect(answer.status === 409 && answer.body.error?.code === code, `${what} answered ${answer.status} ${answer.body.error?.code ?? ""}, expected 409 ${code}`);
  };
  const step = async (name: Tier2Step, work: () => Promise<void>): Promise<void> => {
    current = name;
    await work();
    passed.push(name);
    deps.log(`ok  ${name}`);
  };

  const policyRow = await db.query<{ loan_limit: number; loan_period_days: number | null; renewal_limit: number; fine_daily_rate_centavos: number; fine_cap_centavos: number }>(
    `select p.loan_limit, p.loan_period_days, p.renewal_limit, p.fine_daily_rate_centavos, p.fine_cap_centavos
       from public.members m join public.loan_policies p on p.account_type = m.account_type
      where m.user_id = $1`,
    [member.userId],
  );
  const policy = policyRow.rows[0];
  if (!policy) throw new CheckFailed("The test Member has no Member row or Loan Policy");
  const { loan_period_days: period, renewal_limit: renewalLimit, fine_daily_rate_centavos: rate, fine_cap_centavos: cap } = policy;
  if (period === null || policy.loan_limit < 3 || renewalLimit < 1 || rate <= 0) {
    throw new CheckFailed("The test Member's Loan Policy must allow 3 Loans, at least one Renewal and a Fine rate above 0 (the seeded UMAK Student policy does)");
  }
  const expectedFine = Math.min(DAYS_LATE * rate, cap);

  // The test Book: four Copies (three lent at once, the loan limit of a UMAK Student, and a spare), each with a barcode no real Copy has (real ones start 31).
  const book = await db.query<{ id: string }>("insert into public.books (title, authors) values ($1, '{}') returning id", [`${TEST_BOOK_TITLE} tier 2`]);
  const bookId = book.rows[0]?.id as string;
  const barcodes: string[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const barcode = `99${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
    await db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [bookId, `HC-T2-${randomUUID().slice(0, 8)}-${index}`, barcode]);
    barcodes.push(barcode);
  }
  const [renewedCopy, overdueCopy, onTimeCopy, spareCopy] = barcodes as [string, string, string, string];

  const myLoans = async (): Promise<Loan[]> => expectStatus(await call<MyLoansResponse>("GET", "/members/me/loans", member.accessToken), 200, "GET /members/me/loans").loans;
  const clearance = async (): Promise<ClearanceResponse> => expectStatus(await call<ClearanceResponse>("GET", "/members/me/clearance", member.accessToken), 200, "GET /members/me/clearance");
  const identify = async (): Promise<IdentifyMemberResponse> => {
    const code = expectStatus(await call<DigitalIdResponse>("GET", "/members/me/digital-id", member.accessToken), 200, "GET /members/me/digital-id").code;
    return expectStatus(await call<IdentifyMemberResponse>("POST", "/desk/members/identify", librarianToken, { code }), 200, "Identifying the Member at the desk");
  };
  const lend = (deskSession: string, copy: string) => call<ConfirmLoanResponse>("POST", "/desk/loans", librarianToken, { deskSession, copy });
  const endSession = (deskSession: string) => call("POST", "/desk/sessions/end", librarianToken, { deskSession });
  const giveBack = async (copy: string) => expectStatus(await call<RecordReturnResponse>("POST", "/desk/returns", librarianToken, { copy }), 200, `Returning Copy ${copy}`).loan;
  const renew = (loanId: string) => call<RenewLoanResponse>("POST", `/loans/${loanId}/renew`, member.accessToken);
  const loanIds: Record<string, string> = {};
  const loanOf = (loans: Loan[], copy: string): Loan => {
    const loan = loans.find((candidate) => candidate.id === loanIds[copy]);
    return loan ?? fail(`My Loans does not list the Loan of Copy ${copy}`);
  };
  const renewedDue = (dueAt: string) => new Date(new Date(dueAt).getTime() + period * DAY_MS).toISOString();

  await step("Lend three Copies at the desk", async () => {
    const { deskSession } = await identify();
    try {
      for (const copy of [renewedCopy, overdueCopy, onTimeCopy]) {
        loanIds[copy] = expectStatus(await lend(deskSession.token, copy), 201, `Lending Copy ${copy}`).loan.id;
      }
    } finally {
      await endSession(deskSession.token);
    }
  });

  await step("My Loans has the Tier 2 fields (renewal, renewalCount, fine)", async () => {
    const loans = await myLoans();
    for (const copy of [renewedCopy, overdueCopy, onTimeCopy]) {
      const loan = loanOf(loans, copy);
      expect(loan.renewalCount === 0, `renewalCount is ${String(loan.renewalCount)}, expected 0`);
      expect(loan.fine === null, `fine is ${JSON.stringify(loan.fine)}, expected null`);
      expect(
        loan.renewal?.renewable === true && loan.renewal.dueAt === renewedDue(loan.dueAt),
        `renewal is ${JSON.stringify(loan.renewal)}, expected renewable to ${renewedDue(loan.dueAt)}`,
      );
    }
  });

  await step("Renewal moves the due date by one loan period, up to the renewal limit", async () => {
    let dueAt = loanOf(await myLoans(), renewedCopy).dueAt;
    for (let count = 1; count <= renewalLimit; count += 1) {
      const { loan } = expectStatus(await renew(loanIds[renewedCopy] as string), 200, `Renewal ${count}`);
      expect(loan.renewalCount === count, `renewalCount is ${loan.renewalCount}, expected ${count}`);
      expect(loan.dueAt === renewedDue(dueAt), `due ${loan.dueAt}, expected ${renewedDue(dueAt)}`);
      dueAt = loan.dueAt;
    }
    expectRefused(await renew(loanIds[renewedCopy] as string), "renewal_limit_reached", `Renewal ${renewalLimit + 1}`);
  });

  await step("An overdue Loan shows its Fine so far", async () => {
    // Lent today and due at the end of the day one loan period away: moved back, as if lent one loan period
    // and DAYS_LATE days ago, so it was due at the end of the day DAYS_LATE days ago and today is its DAYS_LATE-th day late.
    await backdateLoan({ db, clock: systemClock, barcode: overdueCopy, days: period + DAYS_LATE });
    const loan = loanOf(await myLoans(), overdueCopy);
    expect(loan.overdue, "the Loan is not overdue");
    expect(
      loan.fine?.amountCentavos === expectedFine && loan.fine.daysLate === DAYS_LATE && !loan.fine.final && loan.fine.settlement === null,
      `fine is ${JSON.stringify(loan.fine)}, expected ${expectedFine} centavos for ${DAYS_LATE} days, not final`,
    );
    expect(loan.renewal?.renewable === false && loan.renewal.reason === "loan_overdue", `renewal is ${JSON.stringify(loan.renewal)}, expected loan_overdue`);
  });

  await step("Clearance and Good standing name the overdue Loan", async () => {
    const { clearance: state, goodStanding } = await clearance();
    expect(!state.cleared && state.loansOut.length === 3 && state.unsettledFines.length === 0, `clearance is ${JSON.stringify(state)}`);
    expect(state.loansOut.some((loan) => loan.loanId === loanIds[overdueCopy] && loan.overdue), "the overdue Loan is not listed as overdue");
    expect(!goodStanding.inGoodStanding && goodStanding.reasons.join() === "overdue_loan", `goodStanding is ${JSON.stringify(goodStanding)}`);
    const onTime = loanOf(await myLoans(), onTimeCopy);
    expect(onTime.renewal?.renewable === false && onTime.renewal.reason === "overdue_loan", `the on-time Loan's renewal is ${JSON.stringify(onTime.renewal)}`);
  });

  await step("A Hold, a Renewal and a Loan are refused for the overdue Loan", async () => {
    expectRefused(await call("POST", "/holds", member.accessToken, { bookId }), "overdue_loan", "POST /holds");
    expectRefused(await renew(loanIds[onTimeCopy] as string), "overdue_loan", "Renewing the on-time Loan");
    // Below the loan limit again, so the only thing that can refuse the next Loan is Good standing.
    const renewedBack = await giveBack(renewedCopy);
    expect(!renewedBack.late && renewedBack.fine === null, `the on-time return of the renewed Copy has fine ${JSON.stringify(renewedBack.fine)}`);
    const { deskSession } = await identify();
    try {
      expectRefused(await lend(deskSession.token, spareCopy), "overdue_loan", "Lending the spare Copy");
    } finally {
      await endSession(deskSession.token);
    }
  });

  await step("The sweep endpoint answers { expired, noticeEmails }", async () => {
    const answer = await call<{ expired: unknown; noticeEmails: unknown }>("POST", "/internal/sweeps/pickup-expiry", deps.sweepSecret);
    expectStatus(answer, 200, "POST /internal/sweeps/pickup-expiry");
    expect(typeof answer.body.expired === "number" && typeof answer.body.noticeEmails === "number", `it answered ${JSON.stringify(answer.body)}`);
  });

  await step("A late return fixes the Fine", async () => {
    const returned = await giveBack(overdueCopy);
    expect(returned.late, "the return is not late");
    expect(
      returned.fine?.amountCentavos === expectedFine && returned.fine.final && returned.fine.settlement === null,
      `fine is ${JSON.stringify(returned.fine)}, expected ${expectedFine} centavos, final, unsettled`,
    );
    const onTime = await giveBack(onTimeCopy);
    expect(!onTime.late && onTime.fine === null, `the on-time return has fine ${JSON.stringify(onTime.fine)}`);
  });

  await step("Clearance and Good standing name the unsettled Fine", async () => {
    const { clearance: state, goodStanding } = await clearance();
    const [fine, ...others] = state.unsettledFines;
    expect(
      !state.cleared && state.loansOut.length === 0 && others.length === 0 && fine?.loanId === loanIds[overdueCopy] && fine?.amountCentavos === expectedFine,
      `clearance is ${JSON.stringify(state)}`,
    );
    expect(!goodStanding.inGoodStanding && goodStanding.reasons.join() === "unsettled_fine", `goodStanding is ${JSON.stringify(goodStanding)}`);
  });

  await step("A Loan is refused for the unsettled Fine, then lent in the same visit after the Fine is settled", async () => {
    const { deskSession, member: atDesk } = await identify();
    try {
      expect(!atDesk.clearance.cleared && atDesk.clearance.unsettledFines.length === 1, `the desk shows ${JSON.stringify(atDesk.clearance)}`);
      expectRefused(await lend(deskSession.token, spareCopy), "unsettled_fine", "Lending the spare Copy");
      const settled = expectStatus(
        await call<SettleFineResponse>("POST", "/desk/fines/settle", librarianToken, { place: "desk_session", deskSession: deskSession.token, loan: loanIds[overdueCopy], outcome: "paid" }),
        200,
        "Settling the Fine as paid",
      );
      expect(settled.settlement.outcome === "paid" && settled.member.clearance.unsettledFines.length === 0, `the settle answered ${JSON.stringify(settled)}`);
      loanIds[spareCopy] = expectStatus(await lend(deskSession.token, spareCopy), 201, "Lending the spare Copy after the settle").loan.id;
    } finally {
      await endSession(deskSession.token);
    }
    await giveBack(spareCopy);
  });

  await step("The Member is cleared and in Good standing again, and My Loans shows the Fine as paid", async () => {
    const { clearance: state, goodStanding } = await clearance();
    expect(state.cleared && goodStanding.inGoodStanding, `clearance is ${JSON.stringify(state)}, goodStanding ${JSON.stringify(goodStanding)}`);
    const past = loanOf(await myLoans(), overdueCopy);
    expect(past.fine?.settlement?.outcome === "paid", `the returned Loan's fine is ${JSON.stringify(past.fine)}`);
  });

  await step("A password reset request gets the neutral reply", async () => {
    // An address with no account: the API answers as for a Member, and sends nothing.
    const email = `${TEST_EMAIL_PREFIX}nobody-${randomUUID().slice(0, 8)}@example.com`;
    const reply = expectStatus(await call<PasswordResetRequestedResponse>("POST", "/members/password-reset", undefined, { email }), 200, "POST /members/password-reset");
    expect(reply.email === email && !Number.isNaN(Date.parse(reply.codeExpiresAt)), `it answered ${JSON.stringify(reply)}`);
  });

  await step("The audit log has the Renewal, the Fine and the settlement, and its chain is intact", async () => {
    const entries = await db.query<{ event_type: string; subject: string }>(
      "select event_type, subject from public.audit_log where event_type in ('loan_renewed', 'fine_fixed', 'fine_settled') and subject = any($1)",
      [[loanIds[renewedCopy], loanIds[overdueCopy]]],
    );
    const found = entries.rows.map((row) => `${row.event_type} ${row.subject}`);
    for (const wanted of [`fine_fixed ${loanIds[overdueCopy]}`, `fine_settled ${loanIds[overdueCopy]}`, `loan_renewed ${loanIds[renewedCopy]}`]) {
      expect(found.includes(wanted), `no audit entry ${wanted}`);
    }
    const verification = await createAuditLog({ db, clock: systemClock }).verify();
    expect(verification.intact, verification.intact ? "" : `${verification.problem.kind} at entry ${verification.problem.seq}: ${verification.problem.message}`);
  });

  return { passed, fineCentavos: expectedFine };
}

/** Whether an address belongs to a test Member the hosted checks made: the prefix, or the developer's +alias with it. */
const TEST_MEMBER_EMAIL = `(lower(u.email) like '${TEST_EMAIL_PREFIX}%' or lower(u.email) like '%+${TEST_EMAIL_PREFIX}%')`;

/**
 * For the demo on real phones: moves the open Loan of the Copy with this barcode `days` whole days back, both when
 * it was lent and when it is due, as if the Librarian had lent it that many days earlier. A seven-day Loan moved back
 * 6 days is due tomorrow (the due-tomorrow notice), moved back 10 days it is three days late (a Fine of three days).
 *
 * Only a Loan of a test Member moves (an address that starts with TEST_EMAIL_PREFIX, or the developer's +alias with
 * it): a real Member's Loan is refused, so a mistyped barcode cannot change a real due date. Each move is recorded in
 * the audit log as `loan_backdated`, in the same transaction; the `loan_confirmed` entry keeps the real time.
 */
export async function backdateLoan({ db, clock, barcode, days }: { db: Database; clock: Clock; barcode: string; days: number }): Promise<{ dueAt: string }> {
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error("Give a whole number of days from 1 to 60.");
  return withTransaction(db, async (tx) => {
    const open = await tx.query<{ id: string; member_id: string; due_at: Date; test_member: boolean }>(
      `select l.id, l.member_id, l.due_at, coalesce(${TEST_MEMBER_EMAIL}, false) as test_member
         from public.loans l
         join public.copies c on c.id = l.copy_id
         left join auth.users u on u.id = l.member_id
        where c.barcode = $1 and l.returned_at is null
          for update of l`,
      [barcode],
    );
    const loan = open.rows[0];
    if (!loan) throw new Error(`No Loan is open for the Copy with barcode ${barcode}.`);
    if (!loan.test_member) {
      throw new Error(
        `The Loan of Copy ${barcode} belongs to a Member who is not a test Member. Only Loans of Members whose address starts with ${TEST_EMAIL_PREFIX} (or a +${TEST_EMAIL_PREFIX} alias) can be moved. Nothing was changed.`,
      );
    }
    const moved = await tx.query<{ due_at: Date }>(
      `update public.loans
          set checked_out_at = checked_out_at - make_interval(days => $2), due_at = due_at - make_interval(days => $2)
        where id = $1
        returning due_at`,
      [loan.id, days],
    );
    const row = moved.rows[0];
    if (!row) throw new Error(`The Loan of Copy ${barcode} could not be moved.`);
    const dueAt = row.due_at.toISOString();
    await createAuditLog({ db, clock }).record(
      {
        type: "loan_backdated",
        subject: loan.id,
        data: { memberId: loan.member_id, barcode, days, previousDueAt: loan.due_at.toISOString(), dueAt },
      },
      tx,
    );
    return { dueAt };
  });
}

/** Deletes every test Member, test Book, Copy, Loan, Fine, Hold, notice and reset request the hosted checks made. The audit log keeps its entries. */
export async function cleanupHostedChecks(db: Database): Promise<{ members: number; books: number }> {
  const users = await db.query<{ id: string }>("select id from auth.users where email like $1 or email like $2", [`${TEST_EMAIL_PREFIX}%`, `%+${TEST_EMAIL_PREFIX}%`]);
  const ids = users.rows.map((row) => row.id);
  const books = (await db.query<{ id: string }>("select id from public.books where title like $1", [`${TEST_BOOK_TITLE}%`])).rows.map((row) => row.id);
  await withTransaction(db, async (tx) => {
    await tx.query("delete from public.digital_id_uses where member_id = any($1)", [ids]);
    // Fines and Loan notices go with their Loans (on delete cascade).
    await tx.query("delete from public.loans where member_id = any($1) or copy_id in (select id from public.copies where book_id = any($2))", [ids, books]);
    await tx.query("delete from public.holds where member_id = any($1) or book_id = any($2)", [ids, books]);
    await tx.query("delete from public.copies where book_id = any($1)", [books]);
    await tx.query("delete from public.books where id = any($1)", [books]);
    await tx.query("delete from public.password_resets where email like $1", [`${TEST_EMAIL_PREFIX}%`]);
    await tx.query("delete from auth.users where id = any($1)", [ids]);
  });
  return { members: ids.length, books: books.length };
}
