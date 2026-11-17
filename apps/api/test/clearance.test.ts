import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type {
  Clearance,
  ClearanceResponse,
  ConfirmLoanResponse,
  FineOutcome,
  RecordReturnResponse,
  ReturnedLoan,
} from "@libras/shared";
import { createTestMember, createTestMemberOfType } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { TestCopy, TestLibrarian } from "./loans-harness.ts";

/** The seeded Loan Policy of the borrowing Account Types: PHP 5 a day, in centavos. */
const RATE = 500;

describe("Clearance", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  const { at, identifyAtDesk } = h;

  /** What the Member's Profile shows, from the real endpoint. */
  const clearanceOf = async (member: TestMember): Promise<Clearance> => {
    const response = await h.send("GET", "/members/me/clearance", member.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as ClearanceResponse).clearance;
  };
  /** The Member as the desk shows them when the Librarian scans their Digital ID. */
  const clearanceAtDesk = async (member: TestMember): Promise<Clearance> => (await identifyAtDesk(lita, member)).member.clearance;
  /** The Librarian lends a new Copy of a new Book to the Member on 12 Nov at 10:00 in Manila: due the end of 19 Nov. */
  const lend = async (member: TestMember, title = "Not Yet Cleared") => {
    const copy = (await h.addBook(title)).copies[0] as TestCopy;
    at("2026-11-12 10:00");
    const response = await h.lendAtDesk(lita, member, copy.barcode);
    assert.equal(response.status, 201, await response.clone().text());
    return { copy, loanId: ((await response.json()) as ConfirmLoanResponse).loan.id };
  };
  const giveBack = async (copy: TestCopy): Promise<ReturnedLoan> => {
    const response = await h.send("POST", "/desk/returns", lita.accessToken, { copy: copy.barcode });
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as RecordReturnResponse).loan;
  };
  const settle = async (member: TestMember, loanId: string, outcome: FineOutcome) => {
    const { deskSession } = await identifyAtDesk(lita, member);
    const response = await h.send("POST", "/desk/fines/settle", lita.accessToken, {
      place: "desk_session",
      deskSession: deskSession.token,
      loan: loanId,
      outcome,
    });
    assert.equal(response.status, 200, await response.clone().text());
  };

  before(async () => {
    await h.start();
    lita = await h.librarian("Lita Reyes");
  });
  after(() => h.stop());
  beforeEach(() => {
    at("2026-11-12 09:00");
  });

  it("clears a Member with no Loan and no Fine", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });

    assert.deepEqual(await clearanceOf(ana), { cleared: true, loansOut: [], unsettledFines: [] });
    assert.deepEqual(await clearanceAtDesk(ana), { cleared: true, loansOut: [], unsettledFines: [] });
  });

  it("does not clear a Member whose Loan is out and on time, and names the Loan", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const { copy, loanId } = await lend(ana);
    at("2026-11-15 12:00");

    const expected: Clearance = {
      cleared: false,
      loansOut: [
        {
          loanId,
          bookTitle: "Not Yet Cleared",
          accessionNumber: copy.accessionNumber,
          dueAt: "2026-11-19T15:59:59.999Z",
          overdue: false,
        },
      ],
      unsettledFines: [],
    };
    assert.deepEqual(await clearanceOf(ana), expected);
    assert.deepEqual(await clearanceAtDesk(ana), expected);
  });

  it("marks a Loan that is out past its due date as overdue, still blocking Clearance with no Fine yet", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    await lend(ana);
    at("2026-11-20 00:00");

    const clearance = await clearanceOf(ana);

    assert.equal(clearance.cleared, false);
    assert.equal(clearance.loansOut[0]?.overdue, true);
    // A Fine is only fixed at the return: an overdue Loan blocks as a Loan, not as a Fine.
    assert.deepEqual(clearance.unsettledFines, []);
  });

  it("clears again after an on-time return", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const { copy } = await lend(ana);
    at("2026-11-19 12:00");
    await giveBack(copy);

    assert.deepEqual(await clearanceOf(ana), { cleared: true, loansOut: [], unsettledFines: [] });
  });

  it("does not clear a Member whose late return left a Fine, then clears them once it is settled, paid or waived", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Reyes" });
    for (const [member, outcome] of [
      [ana, "paid"],
      [ben, "waived"],
    ] as const) {
      const { copy, loanId } = await lend(member, `Late ${outcome}`);
      at("2026-11-21 15:00");
      const returned = await giveBack(copy);
      assert.equal(returned.fine?.amountCentavos, 2 * RATE);

      // The Loan is back, so only the Fine stands in the way.
      const blocked: Clearance = {
        cleared: false,
        loansOut: [],
        unsettledFines: [
          {
            loanId,
            bookTitle: `Late ${outcome}`,
            accessionNumber: copy.accessionNumber,
            amountCentavos: 2 * RATE,
            daysLate: 2,
            returnedAt: returned.returnedAt,
          },
        ],
      };
      assert.deepEqual(await clearanceOf(member), blocked);
      assert.deepEqual(await clearanceAtDesk(member), blocked);

      await settle(member, loanId, outcome);

      assert.deepEqual(await clearanceOf(member), { cleared: true, loansOut: [], unsettledFines: [] });
      assert.deepEqual(await clearanceAtDesk(member), { cleared: true, loansOut: [], unsettledFines: [] });
    }
  });

  it("lists every Loan out, the one due soonest first, and every unsettled Fine, the earliest return first", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const first = await lend(ana, "First Out");
    at("2026-11-12 11:00");
    const secondCopy = (await h.addBook("Second Out")).copies[0] as TestCopy;
    assert.equal((await h.lendAtDesk(lita, ana, secondCopy.barcode)).status, 201);
    at("2026-11-21 15:00");
    await giveBack(first.copy);

    const clearance = await clearanceOf(ana);

    assert.deepEqual(clearance.loansOut.map((loan) => loan.bookTitle), ["Second Out"]);
    assert.deepEqual(clearance.unsettledFines.map((fine) => fine.loanId), [first.loanId]);
    assert.equal(clearance.cleared, false);
  });

  it("shows a Member only their own Loans and Fines", async () => {
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Reyes" });
    await lend(ana);

    assert.deepEqual(await clearanceOf(ben), { cleared: true, loansOut: [], unsettledFines: [] });
  });

  it("applies to every Account Type, including one that cannot borrow", async () => {
    const visitor = await createTestMemberOfType(h.api(), "visitor");

    assert.deepEqual(await clearanceOf(visitor), { cleared: true, loansOut: [], unsettledFines: [] });
  });

  it("is for signed-in Members only", async () => {
    assert.equal((await h.send("GET", "/members/me/clearance", null)).status, 401);
    const response = await h.send("GET", "/members/me/clearance", lita.accessToken);
    assert.equal((await refusal(response)).code, "not_member");
    assert.equal(response.status, 403);
  });
});
