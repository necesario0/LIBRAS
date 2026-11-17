import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { FINE_MESSAGES } from "@libras/shared";
import type {
  ConfirmLoanResponse,
  FineOutcome,
  IdentifyMemberResponse,
  Loan,
  RecordReturnResponse,
  ReturnedLoan,
  SettleFineResponse,
} from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { withIdentity } from "../src/auth/index.ts";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { TestCopy, TestLibrarian } from "./loans-harness.ts";

/** The seeded Loan Policy of the borrowing Account Types: PHP 5 a day, in centavos. */
const RATE = 500;

describe("Settling a Fine at the desk", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let manuel: TestLibrarian;

  /** A moment in Manila, "2026-11-20 00:00", as the API's clock takes it. */
  const at = (manila: string) => h.api().clock.set(new Date(`${manila.replace(" ", "T")}:00.000+08:00`).toISOString());

  /** A Member borrows a Copy on 12 Nov at 10:00 in Manila (due the end of 19 Nov) and it comes back `daysLate` days late, at 15:00. */
  const lateReturn = async (member: TestMember, daysLate = 2) => {
    const book = await h.addBook("Settle Me");
    const copy = book.copies[0] as TestCopy;
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const lent = await h.lendAtDesk(lita, member, copy.barcode);
    assert.equal(lent.status, 201);
    const { loan } = (await lent.json()) as ConfirmLoanResponse;
    at(`2026-11-${19 + daysLate} 15:00`);
    const response = await h.send("POST", "/desk/returns", lita.accessToken, { copy: copy.barcode });
    assert.equal(response.status, 200, await response.clone().text());
    const returned = ((await response.json()) as RecordReturnResponse).loan;
    assert.equal(returned.id, loan.id);
    return returned;
  };
  const settle = (librarian: TestLibrarian, body: unknown) => h.send("POST", "/desk/fines/settle", librarian.accessToken, body);
  const settleAtReturn = (librarian: TestLibrarian, loan: ReturnedLoan, outcome: FineOutcome) =>
    settle(librarian, { place: "return", loan: loan.id, outcome });
  const settleInSession = (librarian: TestLibrarian, deskSession: string, loanId: string, outcome: FineOutcome) =>
    settle(librarian, { place: "desk_session", deskSession, loan: loanId, outcome });
  const loanOf = async (member: TestMember, loanId: string): Promise<Loan> => {
    const loan = (await h.loansOf(member)).find((candidate) => candidate.id === loanId);
    assert.ok(loan, "the Loan is in My Loans");
    return loan;
  };
  /** The Librarian scans the Member's Digital ID: the Member panel and the desk session, as the desk page gets them. */
  const identifyAtDesk = async (librarian: TestLibrarian, member: TestMember): Promise<IdentifyMemberResponse> => {
    const response = await h.identify(librarian, await h.digitalIdOf(member));
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as IdentifyMemberResponse;
  };
  const fineRows = async (loanId: string) =>
    (await h.api().db.query("select settled_outcome, settled_by, settled_at from public.fines where loan_id = $1", [loanId])).rows;
  const settledEntries = async (loanId: string) =>
    (await createAuditLog(h.api()).entries({ limit: 5000 })).filter((entry) => entry.type === "fine_settled" && entry.subject === loanId);

  before(async () => {
    await h.start();
    lita = await h.librarian("Lita Reyes");
    manuel = await h.librarian("Manuel Cruz");
  });
  after(() => h.stop());
  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  for (const outcome of ["paid", "waived"] as const) {
    it(`settles a Fine as ${outcome} on the return of the late Copy: outcome and time are kept, and the audit log names the Librarian`, async () => {
      const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
      const audit = createAuditLog(h.api());
      const before = (await audit.newest())?.seq ?? 0;
      const returned = await lateReturn(ana);
      assert.equal(returned.fine?.settlement, null);
      at("2026-11-21 15:04");

      const response = await settleAtReturn(lita, returned, outcome);

      assert.equal(response.status, 200, await response.clone().text());
      const body = (await response.json()) as SettleFineResponse;
      const settlement = { outcome, settledAt: "2026-11-21T07:04:00.000Z" };
      assert.equal(body.loanId, returned.id);
      assert.deepEqual(body.settlement, settlement);
      assert.deepEqual(body.member.unsettledFines, []);
      // The Member sees the same, and the amount is untouched.
      assert.deepEqual((await loanOf(ana, returned.id)).fine, {
        amountCentavos: 2 * RATE,
        daysLate: 2,
        dailyRateCentavos: RATE,
        capCentavos: 30_000,
        final: true,
        settlement,
      });
      assert.deepEqual(await fineRows(returned.id), [
        { settled_outcome: outcome, settled_by: lita.userId, settled_at: new Date(settlement.settledAt) },
      ]);
      const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.subject === returned.id);
      assert.deepEqual(
        entries.map((entry) => entry.type),
        ["loan_confirmed", "copy_returned", "fine_fixed", "fine_settled"],
      );
      assert.equal(entries[3]?.actorId, lita.userId);
      assert.deepEqual(entries[3]?.data, { memberId: ana.member.id, outcome, amountCentavos: 2 * RATE, place: "return" });
      assert.equal((await audit.verify()).intact, true);
    });
  }

  it("leaves a Fine unsettled when nobody settles it at the return, then lists it in the Member's desk session, where it is settled", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const first = await lateReturn(ana, 1);
    const second = await lateReturn(ana, 3);
    assert.equal((await loanOf(ana, first.id)).fine?.settlement, null);
    at("2026-12-03 09:00");

    const identified = await identifyAtDesk(lita, ana);

    // Earliest return first, with what the Librarian needs to tell the Member.
    assert.deepEqual(identified.member.unsettledFines, [
      {
        loanId: first.id,
        bookTitle: "Settle Me",
        accessionNumber: first.accessionNumber,
        amountCentavos: RATE,
        daysLate: 1,
        returnedAt: first.returnedAt,
      },
      {
        loanId: second.id,
        bookTitle: "Settle Me",
        accessionNumber: second.accessionNumber,
        amountCentavos: 3 * RATE,
        daysLate: 3,
        returnedAt: second.returnedAt,
      },
    ]);

    const waived = await settleInSession(lita, identified.deskSession.token, first.id, "waived");
    assert.equal(waived.status, 200, await waived.clone().text());
    const body = (await waived.json()) as SettleFineResponse;
    assert.deepEqual(body.settlement, { outcome: "waived", settledAt: "2026-12-03T01:00:00.000Z" });
    assert.deepEqual(
      body.member.unsettledFines.map((fine) => fine.loanId),
      [second.id],
    );
    const paid = await settleInSession(lita, identified.deskSession.token, second.id, "paid");
    assert.equal(paid.status, 200);
    assert.deepEqual(((await paid.json()) as SettleFineResponse).member.unsettledFines, []);

    assert.equal((await loanOf(ana, first.id)).fine?.settlement?.outcome, "waived");
    assert.equal((await loanOf(ana, second.id)).fine?.settlement?.outcome, "paid");
    assert.deepEqual((await identifyAtDesk(lita, ana)).member.unsettledFines, []);
    for (const loan of [first, second]) {
      const [entry] = await settledEntries(loan.id);
      assert.equal(entry?.actorId, lita.userId);
      assert.equal((entry?.data as { place: string }).place, "desk_session");
    }
  });

  it("never settles a Fine twice, in either place: the first outcome stays and only one audit entry is written", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);
    at("2026-11-21 15:01");
    assert.equal((await settleAtReturn(lita, returned, "paid")).status, 200);
    const settledAt = (await fineRows(returned.id))[0].settled_at;
    at("2026-11-21 15:02");

    const again = await settleAtReturn(lita, returned, "waived");
    assert.deepEqual(await refusal(again), { status: 409, code: "fine_already_settled", message: FINE_MESSAGES.alreadySettled });
    const identified = await identifyAtDesk(lita, ana);
    const inSession = await settleInSession(lita, identified.deskSession.token, returned.id, "waived");
    assert.equal((await refusal(inSession)).code, "fine_already_settled");
    // Another Librarian's session for the same Member (a minute later, when their Digital ID code is a new one).
    at("2026-11-21 15:05");
    const other = await identifyAtDesk(manuel, ana);
    assert.equal((await refusal(await settleInSession(manuel, other.deskSession.token, returned.id, "paid"))).code, "fine_already_settled");

    assert.deepEqual(await fineRows(returned.id), [{ settled_outcome: "paid", settled_by: lita.userId, settled_at: settledAt }]);
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement?.outcome, "paid");
    assert.equal((await settledEntries(returned.id)).length, 1);
  });

  it("settles a Fine once when two Librarians settle it at the same moment, with one audit entry", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);
    const identified = await identifyAtDesk(lita, ana);
    at("2026-11-21 15:05");
    const other = await identifyAtDesk(manuel, ana);

    const [paid, waived] = await Promise.all([
      settleInSession(lita, identified.deskSession.token, returned.id, "paid"),
      settleInSession(manuel, other.deskSession.token, returned.id, "waived"),
    ]);

    assert.deepEqual([paid.status, waived.status].sort(), [200, 409]);
    const winner = paid.status === 200 ? "paid" : "waived";
    assert.equal((await fineRows(returned.id))[0].settled_outcome, winner);
    assert.deepEqual(
      (await settledEntries(returned.id)).map((entry) => (entry.data as { outcome: string }).outcome),
      [winner],
    );
  });

  it("refuses everyone but a signed-in Librarian, and settles nothing", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);
    const body = { place: "return", loan: returned.id, outcome: "paid" };

    const asMember = await h.send("POST", "/desk/fines/settle", ana.accessToken, body);
    const signedOut = await h.send("POST", "/desk/fines/settle", null, body);

    assert.deepEqual([asMember.status, (await asMember.json()).error.code], [403, "not_staff"]);
    assert.equal(signedOut.status, 401);
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement, null);
  });

  it("settles on a return only for the Librarian who recorded it, and only for ten minutes", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);

    // Another Librarian was not at that return.
    const other = await settleAtReturn(manuel, returned, "paid");
    assert.deepEqual(await refusal(other), { status: 404, code: "fine_not_found", message: FINE_MESSAGES.notFound });

    // Up to ten minutes after the return it is still that return; then the Member's desk session is the place.
    at("2026-11-21 15:10");
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement, null);
    h.api().clock.advance({ minutes: 1 });
    const late = await settleAtReturn(lita, returned, "paid");
    assert.deepEqual(await refusal(late), { status: 409, code: "settle_at_return_ended", message: FINE_MESSAGES.returnSettleEnded });
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement, null);

    const identified = await identifyAtDesk(lita, ana);
    assert.equal((await settleInSession(lita, identified.deskSession.token, returned.id, "paid")).status, 200);
  });

  it("settles in a desk session only a Fine of that session's Member, and only while the session lasts", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Reyes" });
    const anas = await lateReturn(ana);
    const bens = await lateReturn(ben);
    const book = await h.addBook("On Time");
    const copy = book.copies[0] as TestCopy;
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const lent = await h.lendAtDesk(lita, ana, copy.barcode);
    const onTime = ((await lent.json()) as ConfirmLoanResponse).loan.id;
    at("2026-11-25 10:00");
    const session = await identifyAtDesk(lita, ana);

    // Ben's Fine is not Ana's; a Loan with no Fine, and a Loan that does not exist, are not Fines at all.
    for (const loanId of [bens.id, onTime, "8a0b2c1d-0000-4000-8000-000000000000"]) {
      assert.deepEqual(await refusal(await settleInSession(lita, session.deskSession.token, loanId, "paid")), {
        status: 404,
        code: "fine_not_found",
        message: FINE_MESSAGES.notFound,
      });
    }
    // Another Librarian cannot use Ana's session, and a session that is over settles nothing.
    assert.equal((await refusal(await settleInSession(manuel, session.deskSession.token, anas.id, "paid"))).code, "desk_session_ended");
    assert.equal((await h.endDeskSession(lita, session.deskSession.token)).status, 204);
    assert.equal((await refusal(await settleInSession(lita, session.deskSession.token, anas.id, "paid"))).code, "desk_session_ended");

    assert.equal((await loanOf(ana, anas.id)).fine?.settlement, null);
    assert.equal((await loanOf(ben, bens.id)).fine?.settlement, null);
  });

  it("rejects a request that does not say Paid or Waived, or does not say where it is settled", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);
    for (const body of [
      { place: "return", loan: returned.id },
      { place: "return", loan: returned.id, outcome: "forgiven" },
      { place: "return", loan: "not-an-id", outcome: "paid" },
      { place: "somewhere", loan: returned.id, outcome: "paid" },
      { place: "return", loan: returned.id, outcome: "paid", amountCentavos: 1 },
      { loan: returned.id, outcome: "paid" },
    ]) {
      assert.deepEqual(
        await refusal(await settle(lita, body)),
        { status: 400, code: "invalid_request", message: FINE_MESSAGES.invalidRequest },
        JSON.stringify(body),
      );
    }
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement, null);
  });

  it("does not let a Member or a Librarian settle a Fine straight in the database", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);

    for (const identity of [
      { userId: ana.member.id, email: ana.email },
      { userId: lita.userId, email: "librarian@example.com" },
    ]) {
      const outcome = await withIdentity(h.api().db, identity, async (scope) => {
        await scope.query("savepoint attempt");
        try {
          await scope.query(
            `update public.fines set settled_outcome = 'waived', settled_by = '${lita.userId}', settled_at = now() where loan_id = '${returned.id}'`,
          );
          return "allowed";
        } catch {
          return "refused";
        } finally {
          await scope.query("rollback to savepoint attempt");
        }
      });
      assert.equal(outcome, "refused", identity.email);
    }
    assert.equal((await loanOf(ana, returned.id)).fine?.settlement, null);
  });

  it("keeps a settlement all or nothing in the database", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const returned = await lateReturn(ana);
    await assert.rejects(
      h.api().db.query("update public.fines set settled_outcome = 'paid' where loan_id = $1", [returned.id]),
      /fines_settlement_complete/,
    );
  });
});
