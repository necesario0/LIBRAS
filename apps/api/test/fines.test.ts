import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ConfirmLoanResponse, Loan, RecordReturnResponse, ReturnedLoan } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { withIdentity } from "../src/auth/index.ts";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness } from "./loans-harness.ts";
import type { TestCopy, TestLibrarian } from "./loans-harness.ts";

/** The seeded Loan Policy of the borrowing Account Types (spec #29): PHP 5 a day, at most PHP 300, in centavos. */
const RATE = 500;
const CAP = 30_000;

describe("Fines on late Loans", () => {
  const h = loansHarness();
  let lita: TestLibrarian;

  /** A fresh Member borrows a fresh Copy on 12 Nov at 10:00 in Manila: it is due at the end of 19 Nov. */
  const lentLoan = async (member?: TestMember) => {
    const loanMember = member ?? (await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" }));
    const book = await h.addBook("Late Again");
    const copy = book.copies[0] as TestCopy;
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const response = await h.lendAtDesk(lita, loanMember, copy.barcode);
    assert.equal(response.status, 201);
    const { loan } = (await response.json()) as ConfirmLoanResponse;
    return { member: loanMember, copy, loanId: loan.id };
  };
  const loanOf = async (member: TestMember, loanId: string): Promise<Loan> => {
    const loan = (await h.loansOf(member)).find((candidate) => candidate.id === loanId);
    assert.ok(loan, "the Loan is in My Loans");
    return loan;
  };
  /** The Librarian scans the Copy with no Member at the desk: its return. */
  const giveBack = async (copy: TestCopy): Promise<ReturnedLoan> => {
    const response = await h.send("POST", "/desk/returns", lita.accessToken, { copy: copy.barcode });
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as RecordReturnResponse).loan;
  };
  /** Changes the Loan Policy of UMAK Students for the length of `work`, then puts the seeded one back. */
  const withStudentPolicy = async (rate: number, cap: number, work: () => Promise<void>) => {
    await h.api().db.query(
      "update public.loan_policies set fine_daily_rate_centavos = $1, fine_cap_centavos = $2 where account_type = 'umak_student'",
      [rate, cap],
    );
    try {
      await work();
    } finally {
      await h.api().db.query(
        "update public.loan_policies set fine_daily_rate_centavos = $1, fine_cap_centavos = $2 where account_type = 'umak_student'",
        [RATE, CAP],
      );
    }
  };
  /** A moment in Manila, "2026-11-20 00:00", as the API's clock takes it. */
  const at = (manila: string) => h.api().clock.set(new Date(`${manila.replace(" ", "T")}:00.000+08:00`).toISOString());

  before(async () => {
    await h.start({
      // A route that asks PostgreSQL for the Fines of some Loans as whoever is signed in, reading the
      // Fines alone (no join that Loans' own row-level security could filter), with no check of its
      // own. It stands in for a bug in the API: row-level security is the second layer.
      extraRoutes: (router, deps) => {
        router.get("/test/fine-rows/:loanIds", async (req, res) => {
          const identity = await deps.auth.identify(req.get("authorization")?.replace("Bearer ", "") ?? "");
          if (!identity) {
            res.status(401).end();
            return;
          }
          const rows = await withIdentity(deps.db, identity, async (scope) => {
            const result = await scope.query(
              "select loan_id, member_id, amount_centavos from public.fines where loan_id = any($1) order by amount_centavos",
              [req.params.loanIds.split(",")],
            );
            return result.rows;
          });
          res.json({ rows });
        });
      },
    });
    lita = await h.librarian();
  });
  after(() => h.stop());
  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  it("shows no Fine until the due date has ended, then the daily rate for every calendar day after it", async () => {
    const { member, loanId } = await lentLoan();

    h.api().clock.set("2026-11-19T15:59:59.999Z");
    assert.equal((await loanOf(member, loanId)).fine, null);

    // The first moment of 20 Nov: one day late already, no grace period.
    h.api().clock.advance({ milliseconds: 1 });
    assert.deepEqual((await loanOf(member, loanId)).fine, {
      amountCentavos: RATE,
      daysLate: 1,
      dailyRateCentavos: RATE,
      capCentavos: CAP,
      final: false,
      settlement: null,
    });

    at("2026-11-20 23:59");
    assert.equal((await loanOf(member, loanId)).fine?.amountCentavos, RATE);
    at("2026-11-22 08:00");
    assert.deepEqual(
      [(await loanOf(member, loanId)).fine?.daysLate, (await loanOf(member, loanId)).fine?.amountCentavos],
      [3, 3 * RATE],
    );
  });

  it("stops growing at the cap of PHP 300: the 60th day late reaches it and later days add nothing", async () => {
    const { member, loanId } = await lentLoan();

    // 18 Jan 2027 is the 60th day after 19 Nov 2026.
    at("2027-01-17 12:00");
    assert.deepEqual((await loanOf(member, loanId)).fine, { amountCentavos: 29_500, daysLate: 59, dailyRateCentavos: RATE, capCentavos: CAP, final: false, settlement: null });
    at("2027-01-18 12:00");
    assert.equal((await loanOf(member, loanId)).fine?.amountCentavos, CAP);
    at("2027-06-30 12:00");
    assert.deepEqual((await loanOf(member, loanId)).fine, { amountCentavos: CAP, daysLate: 223, dailyRateCentavos: RATE, capCentavos: CAP, final: false, settlement: null });
  });

  it("fixes the Fine at the return, counting the day of the return, and tells the desk with the Member's name", async () => {
    const { member, copy, loanId } = await lentLoan();

    // 22 Nov, early morning: the third day after the due date counts in full.
    at("2026-11-22 00:30");
    const returned = await giveBack(copy);

    assert.equal(returned.memberName, "Ana Santos");
    assert.equal(returned.late, true);
    const fixed = { amountCentavos: 3 * RATE, daysLate: 3, dailyRateCentavos: RATE, capCentavos: CAP, final: true, settlement: null };
    assert.deepEqual(returned.fine, fixed);
    // Days go by: the returned Loan no longer grows.
    at("2026-12-25 12:00");
    assert.deepEqual((await loanOf(member, loanId)).fine, fixed);
  });

  it("keeps a fixed Fine when the rate or the cap changes later, while a Loan still out follows the new policy", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lentLoan(ana);
    const out = await lentLoan(ana);
    at("2026-11-24 09:00");
    assert.equal((await giveBack(returned.copy)).fine?.amountCentavos, 5 * RATE);

    await withStudentPolicy(1_000, 2_000, async () => {
      const fixed = (await loanOf(ana, returned.loanId)).fine;
      assert.deepEqual(fixed, { amountCentavos: 5 * RATE, daysLate: 5, dailyRateCentavos: RATE, capCentavos: CAP, final: true, settlement: null });
      assert.deepEqual((await loanOf(ana, out.loanId)).fine, {
        amountCentavos: 2_000,
        daysLate: 5,
        dailyRateCentavos: 1_000,
        capCentavos: 2_000,
        final: false,
        settlement: null,
      });
    });
  });

  it("charges nothing for a Copy returned on time, even at the last moment of its due date", async () => {
    const { member, copy, loanId } = await lentLoan();

    h.api().clock.set("2026-11-19T15:59:59.999Z");
    const returned = await giveBack(copy);

    assert.equal(returned.late, false);
    assert.equal(returned.fine, null);
    at("2026-12-01 12:00");
    assert.equal((await loanOf(member, loanId)).fine, null);
  });

  it("writes the Fine fixed at a return to the audit log, with the Librarian who recorded the return", async () => {
    const { member, copy, loanId } = await lentLoan();
    const audit = createAuditLog(h.api());
    const before = (await audit.newest())?.seq ?? 0;

    at("2026-11-21 15:00");
    await giveBack(copy);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.subject === loanId);
    assert.deepEqual(
      entries.map((entry) => entry.type),
      ["copy_returned", "fine_fixed"],
    );
    const fixed = entries[1];
    assert.equal(fixed?.actorId, lita.userId);
    assert.deepEqual(fixed?.data, {
      memberId: member.member.id,
      daysLate: 2,
      dailyRateCentavos: RATE,
      capCentavos: CAP,
      amountCentavos: 2 * RATE,
    });
    assert.equal((await audit.verify()).intact, true);
  });

  it("lets PostgreSQL itself refuse one Member another Member's Fines, while a Librarian reads both", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana" });
    const ben = await createTestMember(h.api(), { firstName: "Ben" });
    const book = await h.addBook("Shared Lateness", ["available", "available"]);
    const [first, second] = book.copies as [TestCopy, TestCopy];
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const lend = async (member: TestMember, copy: TestCopy) => {
      const response = await h.lendAtDesk(lita, member, copy.barcode);
      assert.equal(response.status, 201);
      return ((await response.json()) as ConfirmLoanResponse).loan.id;
    };
    const anas = await lend(ana, first);
    const bens = await lend(ben, second);
    at("2026-11-20 10:00");
    await giveBack(first);
    at("2026-11-21 10:00");
    await giveBack(second);
    const rowsAs = async (token: string) => (await (await h.send("GET", `/test/fine-rows/${anas},${bens}`, token)).json()).rows;

    const anasRow = { loan_id: anas, member_id: ana.member.id, amount_centavos: RATE };
    const bensRow = { loan_id: bens, member_id: ben.member.id, amount_centavos: 2 * RATE };
    assert.deepEqual(await rowsAs(ana.accessToken), [anasRow]);
    assert.deepEqual(await rowsAs(ben.accessToken), [bensRow]);
    assert.deepEqual(await rowsAs(lita.accessToken), [anasRow, bensRow]);
    // And through the API: each Member's My Loans has only their own Fine.
    assert.deepEqual(
      (await h.loansOf(ana)).filter((loan) => loan.fine !== null).map((loan) => loan.id),
      [anas],
    );
  });

  it("does not let a Member or a Librarian write a Fine straight to the database", async () => {
    const { member, copy, loanId } = await lentLoan();
    at("2026-11-25 10:00");
    await giveBack(copy);

    for (const identity of [
      { userId: member.member.id, email: member.email },
      { userId: lita.userId, email: "librarian@example.com" },
    ]) {
      const outcomes = await withIdentity(h.api().db, identity, async (scope) => {
        const attempts: string[] = [];
        for (const sql of [
          `update public.fines set amount_centavos = 1 where loan_id = '${loanId}'`,
          `delete from public.fines where loan_id = '${loanId}'`,
          `insert into public.fines (loan_id, member_id, days_late, daily_rate_centavos, cap_centavos, amount_centavos, fixed_at)
           values ('${loanId}', '${member.member.id}', 1, 1, 1, 1, now())`,
          "update public.loan_policies set fine_daily_rate_centavos = 0",
        ]) {
          await scope.query("savepoint attempt");
          try {
            await scope.query(sql);
            attempts.push("allowed");
          } catch {
            attempts.push("refused");
          }
          await scope.query("rollback to savepoint attempt");
        }
        return attempts;
      });
      assert.deepEqual(outcomes, ["refused", "refused", "refused", "refused"], identity.email);
    }
    assert.equal((await loanOf(member, loanId)).fine?.amountCentavos, 6 * RATE);
  });
});
