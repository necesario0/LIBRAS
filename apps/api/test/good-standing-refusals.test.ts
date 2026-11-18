import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { GOOD_STANDING_MESSAGES, LOAN_MESSAGES, RENEWAL_MESSAGES } from "@libras/shared";
import type { ClearanceResponse, ConfirmLoanResponse, FineOutcome, GoodStanding, Loan } from "@libras/shared";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { dispatchHarness, pause, started } from "./dispatch-harness.ts";
import { refusal } from "./loans-harness.ts";
import type { TestCopy } from "./loans-harness.ts";

/**
 * A Member who is not in Good standing (ADR 0010: an overdue Loan or an
 * unsettled Fine) is refused a new Loan, a Hold and a Renewal, each with the
 * reason as its code.
 */
describe("Good standing refusals", () => {
  const h = dispatchHarness();
  const { at } = h;

  /** A new Book with one available Copy. */
  const copyOf = async (title: string): Promise<TestCopy> => (await h.addBook(title)).copies[0] as TestCopy;

  /** The Member borrows a new Copy on 12 Nov at 10:00 in Manila: due the end of 19 Nov. */
  const lentOn12Nov = async (member: TestMember, title: string) => {
    const copy = await copyOf(title);
    at("2026-11-12 10:00");
    const response = await h.lendRequest(member, copy.barcode);
    assert.equal(response.status, 201, await response.clone().text());
    return { copy, loanId: ((await response.json()) as ConfirmLoanResponse).loan.id };
  };

  /** The Member borrows a second Copy on 15 Nov at 10:00 in Manila: due the end of 22 Nov. */
  const lentOn15Nov = async (member: TestMember, title: string) => {
    const copy = await copyOf(title);
    at("2026-11-15 10:00");
    const response = await h.lendRequest(member, copy.barcode);
    assert.equal(response.status, 201, await response.clone().text());
    return { copy, loanId: ((await response.json()) as ConfirmLoanResponse).loan.id };
  };
  /** The Member taps Renew and confirms. */
  const renew = (member: TestMember, loanId: string) => h.send("POST", `/loans/${loanId}/renew`, member.accessToken);
  /** The Loan as My Loans lists it now. */
  const listed = async (member: TestMember, loanId: string): Promise<Loan> => {
    const loan = (await h.loansOf(member)).find((candidate) => candidate.id === loanId);
    assert.ok(loan, "My Loans does not list the Loan");
    return loan;
  };

  /** The Librarian settles the Fine on a Loan in the Member's desk session. */
  const settleInSession = (deskSession: string, loan: string, outcome: FineOutcome) =>
    h.send("POST", "/desk/fines/settle", h.lita().accessToken, { place: "desk_session", deskSession, loan, outcome });

  before(() => h.start());
  after(() => h.stop());
  beforeEach(() => {
    at("2026-11-12 09:00");
  });

  describe("confirming a Loan", () => {
    it("is refused to a Member with an overdue Loan, and nothing is lent", async () => {
      const ana = await createTestMember(h.api());
      await lentOn12Nov(ana, "Kept Too Long");
      const copy = await copyOf("Wanted Next");
      at("2026-11-20 10:00");

      assert.deepEqual(await refusal(await h.lendRequest(ana, copy.barcode)), {
        status: 409,
        code: "overdue_loan",
        message: LOAN_MESSAGES.notInGoodStanding.overdue_loan,
      });
      assert.equal((await h.loansOf(ana)).length, 1);
    });

    it("is refused to a Member with an unsettled Fine, and goes through in the same desk session once the Fine is settled", async () => {
      const ana = await createTestMember(h.api());
      const late = await h.lateReturn(h.lita(), ana, 2);
      const copy = await copyOf("After The Fine");
      const visit = await h.identifyAtDesk(h.lita(), ana);

      assert.deepEqual(await refusal(await h.lendWith(h.lita(), visit.deskSession.token, copy.barcode)), {
        status: 409,
        code: "unsettled_fine",
        message: LOAN_MESSAGES.notInGoodStanding.unsettled_fine,
      });
      assert.equal((await settleInSession(visit.deskSession.token, late.id, "paid")).status, 200);

      const lent = await h.lendWith(h.lita(), visit.deskSession.token, copy.barcode);
      assert.equal(lent.status, 201, await lent.clone().text());
    });

    it("refuses a Member the Copy set aside for their ready Hold while a Fine is unsettled, keeps the Hold ready, and lends it once the Fine is settled", async () => {
      const ana = await createTestMember(h.api());
      const ben = await createTestMember(h.api());
      const { copy: kept, loanId } = await lentOn12Nov(ana, "Kept A Day Too Long");
      // Ben has the only Copy and Ana places a Hold on it, while she is in Good standing.
      const book = await h.lentBook("Waited For", ben);
      const copy = book.copies[0] as TestCopy;
      await h.placeHold(ana, book.id);
      // Ana brings hers back a day late, with a Fine; then Ben's return sets his Copy aside for her.
      at("2026-11-20 15:00");
      await h.giveBack(kept.barcode);
      await h.giveBack(copy.barcode);
      assert.equal((await h.holdOn(ana, book.id)).status, "ready");
      const visit = await h.identifyAtDesk(h.lita(), ana);

      assert.equal((await refusal(await h.lendWith(h.lita(), visit.deskSession.token, copy.barcode))).code, "unsettled_fine");
      assert.equal((await h.holdOn(ana, book.id)).status, "ready");
      await h.assertConsistent(book.id);

      assert.equal((await settleInSession(visit.deskSession.token, loanId, "waived")).status, 200);
      assert.equal((await h.lendWith(h.lita(), visit.deskSession.token, copy.barcode)).status, 201);
      assert.equal((await h.holdOn(ana, book.id)).status, "fulfilled");
    });

    it("names the overdue Loan when the Member also has an unsettled Fine", async () => {
      const ana = await createTestMember(h.api());
      await lentOn12Nov(ana, "Still Out");
      const { copy: backLate } = await lentOn12Nov(ana, "Back Late");
      at("2026-11-21 15:00");
      await h.giveBack(backLate.barcode);

      assert.equal((await refusal(await h.lendRequest(ana, (await copyOf("Both At Once")).barcode))).code, "overdue_loan");
    });
  });

  describe("placing a Hold", () => {
    it("is refused to a Member with an overdue Loan", async () => {
      const ana = await createTestMember(h.api());
      const ben = await createTestMember(h.api());
      await lentOn12Nov(ana, "Overdue Before The Hold");
      const book = await h.lentBook("All Out", ben);
      at("2026-11-20 10:00");

      assert.deepEqual(await refusal(await h.placeHoldRequest(ana, book.id)), {
        status: 409,
        code: "overdue_loan",
        message: GOOD_STANDING_MESSAGES.overdue_loan,
      });
      assert.deepEqual(await h.holdsOf(ana), []);
    });

    it("is refused to a Member with an unsettled Fine, and placed once it is settled", async () => {
      const ana = await createTestMember(h.api());
      const ben = await createTestMember(h.api());
      const late = await h.lateReturn(h.lita(), ana, 3);
      const book = await h.lentBook("Wanted After The Fine", ben);

      assert.deepEqual(await refusal(await h.placeHoldRequest(ana, book.id)), {
        status: 409,
        code: "unsettled_fine",
        message: GOOD_STANDING_MESSAGES.unsettled_fine,
      });
      assert.deepEqual(await h.holdsOf(ana), []);

      const visit = await h.identifyAtDesk(h.lita(), ana);
      assert.equal((await settleInSession(visit.deskSession.token, late.id, "paid")).status, 200);
      assert.equal((await h.placeHoldRequest(ana, book.id)).status, 201);
    });

    it("is not refused for a Loan that is out and on time", async () => {
      const ana = await createTestMember(h.api());
      const ben = await createTestMember(h.api());
      await lentOn12Nov(ana, "Out On Time");
      const book = await h.lentBook("Queued For", ben);

      assert.equal((await h.placeHoldRequest(ana, book.id)).status, 201);
    });
  });

  describe("making a Renewal", () => {
    it("is refused, and My Loans says why, when another of the Member's Loans is overdue", async () => {
      const ana = await createTestMember(h.api());
      await lentOn12Nov(ana, "Due First");
      const { loanId } = await lentOn15Nov(ana, "Due Later");
      // The first Loan is overdue; this one is due at the end of 22 Nov.
      at("2026-11-20 10:00");

      assert.deepEqual((await listed(ana, loanId)).renewal, { renewable: false, reason: "overdue_loan" });
      assert.deepEqual(await refusal(await renew(ana, loanId)), {
        status: 409,
        code: "overdue_loan",
        message: RENEWAL_MESSAGES.refused.overdue_loan,
      });
      assert.equal((await listed(ana, loanId)).dueAt, "2026-11-22T15:59:59.999Z");
    });

    it("is refused, and My Loans says why, while the Member has an unsettled Fine, and made once it is settled", async () => {
      const ana = await createTestMember(h.api());
      const { copy: first } = await lentOn12Nov(ana, "Back Late");
      const { loanId } = await lentOn15Nov(ana, "Renew Me");
      at("2026-11-21 15:00");
      const { id: lateLoanId } = await h.giveBack(first.barcode);

      assert.deepEqual((await listed(ana, loanId)).renewal, { renewable: false, reason: "unsettled_fine" });
      assert.deepEqual(await refusal(await renew(ana, loanId)), {
        status: 409,
        code: "unsettled_fine",
        message: RENEWAL_MESSAGES.refused.unsettled_fine,
      });

      const visit = await h.identifyAtDesk(h.lita(), ana);
      assert.equal((await settleInSession(visit.deskSession.token, lateLoanId, "waived")).status, 200);
      assert.deepEqual((await listed(ana, loanId)).renewal, { renewable: true, dueAt: "2026-11-29T15:59:59.999Z", last: true });
      assert.equal((await renew(ana, loanId)).status, 200);
    });

    it("gives the Loan's own overdue as the reason when the Loan itself is the overdue one", async () => {
      const ana = await createTestMember(h.api());
      const { loanId } = await lentOn12Nov(ana, "Itself Overdue");
      at("2026-11-20 10:00");

      assert.deepEqual((await listed(ana, loanId)).renewal, { renewable: false, reason: "loan_overdue" });
      assert.equal((await refusal(await renew(ana, loanId))).code, "loan_overdue");
    });
  });

  describe("the Profile account screen", () => {
    /** What the Member's Profile reads, from the real endpoint. */
    const goodStandingOf = async (member: TestMember): Promise<GoodStanding> => {
      const response = await h.send("GET", "/members/me/clearance", member.accessToken);
      assert.equal(response.status, 200, await response.clone().text());
      return ((await response.json()) as ClearanceResponse).goodStanding;
    };

    it("says a Member is in Good standing with a Loan out on time, and names every reason when they are not", async () => {
      const ana = await createTestMember(h.api());
      assert.deepEqual(await goodStandingOf(ana), { inGoodStanding: true });
      await lentOn12Nov(ana, "Still Out On Time");
      const { copy: backLate } = await lentOn12Nov(ana, "Back Late Too");
      at("2026-11-19 12:00");
      assert.deepEqual(await goodStandingOf(ana), { inGoodStanding: true });

      at("2026-11-21 15:00");
      const { id: lateLoanId } = await h.giveBack(backLate.barcode);
      assert.deepEqual(await goodStandingOf(ana), { inGoodStanding: false, reasons: ["overdue_loan", "unsettled_fine"] });

      const visit = await h.identifyAtDesk(h.lita(), ana);
      assert.equal((await settleInSession(visit.deskSession.token, lateLoanId, "paid")).status, 200);
      assert.deepEqual(await goodStandingOf(ana), { inGoodStanding: false, reasons: ["overdue_loan"] });
    });
  });

  /**
   * Races, in the style of `pickup-expiry.test.ts`. A settle locks the Member's
   * row first and writes the audit log last, so while another transaction holds
   * the audit log the settle has done everything but commit. An action of the
   * Member started then must wait for it and see the Fine settled: it reads
   * Good standing only under the same lock.
   */
  describe("at the same moment as a settle", () => {
    /** Ana, with an unsettled Fine and nothing overdue, and a second Librarian's desk session for her, where it is settled. */
    const owing = async () => {
      const ana = await createTestMember(h.api());
      const { copy: backLate, loanId: lateLoanId } = await lentOn12Nov(ana, "Settled In The Race");
      const { loanId: onTimeLoanId } = await lentOn15Nov(ana, "On Time In The Race");
      at("2026-11-21 15:00");
      await h.giveBack(backLate.barcode);
      const cashier = await h.librarian("Carlo Cashier");
      const settling = (await h.identifyAtDesk(cashier, ana)).deskSession.token;
      const settle = () =>
        h.send("POST", "/desk/fines/settle", cashier.accessToken, { place: "desk_session", deskSession: settling, loan: lateLoanId, outcome: "paid" });
      return { ana, onTimeLoanId, settle };
    };

    /** Starts the settle, then `action`, while the audit log is held: the action is still waiting when the log is let go. */
    const settleThen = async (settle: () => Promise<Response>, action: () => Promise<Response>) => {
      const { settled, acting } = await h.whileAuditLogIsHeld(async () => {
        const settled = started(settle());
        await pause(400);
        const acting = started(action());
        await pause(400);
        assert.deepEqual([settled.answered, acting.answered], [false, false]);
        return { settled, acting };
      });
      assert.equal((await settled.response).status, 200);
      return acting.response;
    };

    it("confirms the Loan that waited for the settle", async () => {
      const { ana, settle } = await owing();
      const copy = await copyOf("Lent After The Settle");
      // The next code on Ana's phone: the one the cashier scanned stays with the cashier.
      h.api().clock.advance({ minutes: 1 });
      const deskSession = await h.deskSessionFor(ana, h.lita());

      const lent = await settleThen(settle, () => h.lendWith(h.lita(), deskSession, copy.barcode));

      assert.equal(lent.status, 201, await lent.clone().text());
    });

    it("places the Hold that waited for the settle", async () => {
      const { ana, settle } = await owing();
      const book = await h.lentBook("Held After The Settle", await createTestMember(h.api()));

      const placed = await settleThen(settle, () => h.placeHoldRequest(ana, book.id));

      assert.equal(placed.status, 201, await placed.clone().text());
    });

    it("makes the Renewal that waited for the settle", async () => {
      const { ana, onTimeLoanId, settle } = await owing();

      const renewed = await settleThen(settle, () => renew(ana, onTimeLoanId));

      assert.equal(renewed.status, 200, await renewed.clone().text());
    });
  });
});
