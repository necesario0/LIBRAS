import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { RENEWAL_MESSAGES } from "@libras/shared";
import type { Loan, RenewLoanResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember, createTestMemberOfType } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { dispatchHarness, pause, started } from "./dispatch-harness.ts";
import { refusal } from "./loans-harness.ts";
import type { CopyStatus, TestCopy } from "./loans-harness.ts";

describe("Renewing a Loan from My Loans", () => {
  const h = dispatchHarness();

  /** A Member with the first Copy of a new Book out, lent at the desk now. */
  const borrower = async (title: string, copies = 1) => {
    const member = await createTestMember(h.api());
    const book = await h.addBook(title, Array<CopyStatus>(copies).fill("available"));
    const copy = book.copies[0] as TestCopy;
    await h.lend(member, copy.barcode);
    const loan = (await h.loansOf(member))[0] as Loan;
    return { member, book, copy, loan };
  };

  /** The Member taps Renew and confirms. */
  const renew = (member: TestMember, loanId: string) => h.send("POST", `/loans/${loanId}/renew`, member.accessToken);

  /** The Loan as My Loans lists it now. */
  const listed = async (member: TestMember, loanId: string): Promise<Loan> => {
    const loan = (await h.loansOf(member)).find((candidate) => candidate.id === loanId);
    assert.ok(loan, "My Loans does not list the Loan");
    return loan;
  };

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  it("lists a new Loan as renewable, with the due date a Renewal would give", async () => {
    const { loan } = await borrower("Renewable Today");

    // Due at the end of 19 Nov in Manila; one more loan period of 7 days from there is the end of 26 Nov.
    assert.equal(loan.dueAt, "2026-11-19T15:59:59.999Z");
    assert.equal(loan.renewalCount, 0);
    assert.deepEqual(loan.renewal, { renewable: true, dueAt: "2026-11-26T15:59:59.999Z", last: true });
  });

  it("adds one loan period to the current due date, however early the Member renews, and My Loans shows the renewed Loan", async () => {
    const { member, loan } = await borrower("Renewed Early");
    // Two days into the Loan: renewing early costs no days.
    h.api().clock.advance({ days: 2 });

    const response = await renew(member, loan.id);

    assert.equal(response.status, 200, await response.clone().text());
    const renewed = ((await response.json()) as RenewLoanResponse).loan;
    const expected: Loan = {
      ...loan,
      dueAt: "2026-11-26T15:59:59.999Z",
      renewalCount: 1,
      renewal: { renewable: false, reason: "renewal_limit_reached" },
    };
    assert.deepEqual(renewed, expected);
    assert.deepEqual(await h.loansOf(member), [expected]);
  });

  it("renews on the last moment of the due day, and refuses from the next: an overdue Loan cannot be renewed", async () => {
    const { member, loan } = await borrower("Due Today");
    h.api().clock.set("2026-11-19T15:59:59.999Z");
    assert.equal((await listed(member, loan.id)).renewal?.renewable, true);

    h.api().clock.advance({ milliseconds: 1 });

    assert.deepEqual((await listed(member, loan.id)).renewal, { renewable: false, reason: "loan_overdue" });
    assert.deepEqual(await refusal(await renew(member, loan.id)), {
      status: 409,
      code: "loan_overdue",
      message: RENEWAL_MESSAGES.refused.loan_overdue,
    });
    assert.equal((await listed(member, loan.id)).dueAt, "2026-11-19T15:59:59.999Z");
  });

  it("refuses a second Renewal once the renewal limit of the Loan Policy is used", async () => {
    const { member, loan } = await borrower("Renewed Once");
    assert.equal((await renew(member, loan.id)).status, 200);

    assert.deepEqual(await refusal(await renew(member, loan.id)), {
      status: 409,
      code: "renewal_limit_reached",
      message: RENEWAL_MESSAGES.refused.renewal_limit_reached,
    });
    const after = await listed(member, loan.id);
    assert.equal(after.dueAt, "2026-11-26T15:59:59.999Z");
    assert.equal(after.renewalCount, 1);
  });

  it("says when a Renewal is not the last one the Loan Policy allows", async () => {
    await h.api().db.query("update public.loan_policies set renewal_limit = 2 where account_type = 'faculty'");
    try {
      const member = await createTestMemberOfType(h.api(), "faculty");
      const book = await h.addBook("Renewed Twice");
      await h.lend(member, (book.copies[0] as TestCopy).barcode);
      const loan = (await h.loansOf(member))[0] as Loan;
      assert.deepEqual(loan.renewal, { renewable: true, dueAt: "2026-11-26T15:59:59.999Z", last: false });

      const first = ((await (await renew(member, loan.id)).json()) as RenewLoanResponse).loan;
      assert.deepEqual(first.renewal, { renewable: true, dueAt: "2026-12-03T15:59:59.999Z", last: true });
      assert.equal((await renew(member, loan.id)).status, 200);
      assert.deepEqual(await listed(member, loan.id), {
        ...loan,
        dueAt: "2026-12-03T15:59:59.999Z",
        renewalCount: 2,
        renewal: { renewable: false, reason: "renewal_limit_reached" },
      });
    } finally {
      await h.api().db.query("update public.loan_policies set renewal_limit = 1 where account_type = 'faculty'");
    }
  });

  it("refuses a Renewal while another Member's Hold on the Book is waiting, even when My Loans said it could be renewed", async () => {
    const { member, book, loan } = await borrower("Someone Is Waiting");
    const waiter = await createTestMember(h.api());
    // My Loans was loaded before the other Member placed the Hold.
    assert.equal(loan.renewal?.renewable, true);
    await h.placeHold(waiter, book.id);

    assert.deepEqual(await refusal(await renew(member, loan.id)), {
      status: 409,
      code: "hold_waiting",
      message: RENEWAL_MESSAGES.refused.hold_waiting,
    });
    assert.deepEqual((await listed(member, loan.id)).renewal, { renewable: false, reason: "hold_waiting" });
    assert.equal((await listed(member, loan.id)).dueAt, loan.dueAt);
  });

  it("lets a ready Hold on the Book stand: only a waiting Hold blocks a Renewal", async () => {
    const { member, book, loan } = await borrower("Ready Elsewhere", 2);
    const other = await createTestMember(h.api());
    const holder = await createTestMember(h.api());
    const second = book.copies[1] as TestCopy;
    await h.lend(other, second.barcode);
    await h.placeHold(holder, book.id);
    // The other Copy comes back and is set aside for the Hold, which is ready now.
    await h.giveBack(second.barcode);
    assert.equal((await h.holdOn(holder, book.id)).status, "ready");

    assert.equal((await listed(member, loan.id)).renewal?.renewable, true);
    assert.equal((await renew(member, loan.id)).status, 200);
  });

  it("renews only the Member's own Loan: another Member's is not found, and so is one that does not exist", async () => {
    const { member, loan } = await borrower("Not Yours");
    const stranger = await createTestMember(h.api());

    assert.deepEqual(await refusal(await renew(stranger, loan.id)), {
      status: 404,
      code: "loan_not_found",
      message: RENEWAL_MESSAGES.loanNotFound,
    });
    assert.equal((await refusal(await renew(member, randomUUID()))).code, "loan_not_found");
    assert.deepEqual(await refusal(await renew(member, "not-a-loan")), {
      status: 400,
      code: "invalid_request",
      message: RENEWAL_MESSAGES.invalidId,
    });
    assert.equal((await h.send("POST", `/loans/${loan.id}/renew`, null)).status, 401);
    assert.equal((await listed(member, loan.id)).renewalCount, 0);
  });

  it("refuses to renew a Loan whose Copy has been returned, and lists no Renewal for it", async () => {
    const { member, copy, loan } = await borrower("Already Back");
    await h.giveBack(copy.barcode);

    assert.equal((await listed(member, loan.id)).renewal, null);
    assert.deepEqual(await refusal(await renew(member, loan.id)), {
      status: 409,
      code: "loan_returned",
      message: RENEWAL_MESSAGES.loanReturned,
    });
  });

  it("records each Renewal in the audit log, with the Member as the actor, and nothing for a refused one", async () => {
    const audit = createAuditLog(h.api());
    const { member, book, copy, loan } = await borrower("For The Record");
    const before = (await audit.newest())?.seq ?? 0;

    assert.equal((await renew(member, loan.id)).status, 200);
    assert.equal((await renew(member, loan.id)).status, 409);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "loan_renewed");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, member.member.id);
    assert.equal(entries[0]?.subject, loan.id);
    assert.deepEqual(entries[0]?.data, {
      memberId: member.member.id,
      copyId: copy.id,
      bookId: book.id,
      accessionNumber: copy.accessionNumber,
      previousDueAt: "2026-11-19T15:59:59.999Z",
      dueAt: "2026-11-26T15:59:59.999Z",
      renewalCount: 1,
    });
    assert.equal((await audit.verify()).intact, true);
  });

  it("sends no email", async () => {
    const { member, loan } = await borrower("Quietly Renewed");
    h.api().emails.clear();

    assert.equal((await renew(member, loan.id)).status, 200);

    assert.deepEqual(h.api().emails.sent, []);
  });

  it("gives the desk the new due date: a return after a Renewal reports it", async () => {
    const { member, copy, loan } = await borrower("Back After Renewal");
    assert.equal((await renew(member, loan.id)).status, 200);
    // A day after the original due date, but before the new one: on time.
    h.api().clock.set("2026-11-20T02:00:00.000Z");

    const returned = await h.giveBack(copy.barcode);

    assert.equal(returned.dueAt, "2026-11-26T15:59:59.999Z");
    assert.equal(returned.late, false);
  });
});

describe("A Renewal racing other writers", () => {
  const h = dispatchHarness();

  const renewRequest = (member: TestMember, loanId: string) => h.send("POST", `/loans/${loanId}/renew`, member.accessToken);

  /** A Member with the only Copy of a new Book out, and another Member who wants it. */
  const contested = async (title: string) => {
    const member = await createTestMember(h.api());
    const waiter = await createTestMember(h.api());
    const book = await h.addBook(title);
    const copy = book.copies[0] as TestCopy;
    await h.lend(member, copy.barcode);
    const loan = (await h.loansOf(member))[0] as Loan;
    return { member, waiter, book, copy, loan };
  };

  /**
   * Runs `work` while another transaction holds an uncommitted Hold of this Member on the Book.
   * A real `POST /holds` for the same Member and Book started inside `work` has read (and locked
   * `for share`) the Book's Copies, then waits at its insert for that one to end. It rolls back
   * when `work` ends, so the real Hold is the only one placed. This fixes the order of a race.
   */
  const whileHoldIsUncommitted = async <T>(member: TestMember, bookId: string, work: () => Promise<T>): Promise<T> => {
    const blocker = await h.api().db.connect();
    try {
      await blocker.query("begin");
      await blocker.query("insert into public.holds (book_id, member_id, placed_at, weight_hours, score) values ($1, $2, $3, 0, $3)", [
        bookId,
        member.member.id,
        h.api().clock.now(),
      ]);
      return await work();
    } finally {
      await blocker.query("rollback");
      blocker.release();
    }
  };

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  it("renews the Loan when the Renewal locks the Copy first, and the Hold placed at that moment joins the queue after it", async () => {
    const { member, waiter, book, loan } = await contested("Renewal Then Hold");

    // The Renewal has moved the due date but not committed: it waits to write the audit log.
    const { renewing, placing } = await h.whileAuditLogIsHeld(async () => {
      const renewing = started(renewRequest(member, loan.id));
      await pause(400);
      const placing = started(h.placeHoldRequest(waiter, book.id));
      await pause(400);
      assert.deepEqual([renewing.answered, placing.answered], [false, false]);
      return { renewing, placing };
    });

    assert.equal((await renewing.response).status, 200);
    assert.equal((await placing.response).status, 201);
    const after = (await h.loansOf(member))[0] as Loan;
    assert.equal(after.dueAt, "2026-11-26T15:59:59.999Z");
    assert.deepEqual(after.renewal, { renewable: false, reason: "renewal_limit_reached" });
    assert.equal((await h.holdOn(waiter, book.id)).status, "waiting");
  });

  it("refuses the Renewal when a Hold being placed at that moment reads the Copy first", async () => {
    const { member, waiter, book, loan } = await contested("Hold Then Renewal");

    // The Hold has locked the Book's Copies `for share` but not committed: it waits at its insert.
    const { placing, renewing } = await whileHoldIsUncommitted(waiter, book.id, async () => {
      const placing = started(h.placeHoldRequest(waiter, book.id));
      await pause(400);
      const renewing = started(renewRequest(member, loan.id));
      await pause(400);
      assert.deepEqual([placing.answered, renewing.answered], [false, false]);
      return { placing, renewing };
    });

    assert.equal((await placing.response).status, 201);
    assert.equal((await refusal(await renewing.response)).code, "hold_waiting");
    assert.equal(((await h.loansOf(member))[0] as Loan).dueAt, loan.dueAt);
  });

  it("refuses the Renewal of a Copy whose return is being recorded at that moment", async () => {
    const { member, copy, loan } = await contested("Return Then Renewal");

    const { returning, renewing } = await h.whileAuditLogIsHeld(async () => {
      const returning = started(h.giveBackRequest(copy.barcode));
      await pause(400);
      const renewing = started(renewRequest(member, loan.id));
      await pause(400);
      assert.deepEqual([returning.answered, renewing.answered], [false, false]);
      return { returning, renewing };
    });

    assert.equal((await returning.response).status, 200);
    assert.equal((await refusal(await renewing.response)).code, "loan_returned");
  });
});
