import assert from "node:assert/strict";
import type { AccountType, BookDetailResponse, Hold, MyHoldsResponse, PlaceHoldResponse, RecordReturnResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMemberFromSignUp, facultySignUpBody, ntpEmployeeSignUpBody } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness } from "./loans-harness.ts";
import type { CopyStatus, TestBook, TestLibrarian } from "./loans-harness.ts";

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a request (or any work) and tells whether it has been answered yet. */
export const started = <T>(request: Promise<T>) => {
  const call = { response: request, answered: false };
  void request.then(
    () => {
      call.answered = true;
    },
    () => {
      call.answered = true;
    },
  );
  return call;
};

/** What the Hold dispatch tests do on top of the Loan tests' harness: lend, give back, place and read Holds. */
export function dispatchHarness() {
  const h = loansHarness();
  const state: { librarian?: TestLibrarian } = {};
  const lita = () => {
    if (!state.librarian) throw new Error("No Librarian is signed in");
    return state.librarian;
  };
  const lendRequest = (member: TestMember, copy: string, librarian = lita()) => h.lendAtDesk(librarian, member, copy);
  const lend = async (member: TestMember, copy: string) => {
    const response = await lendRequest(member, copy);
    assert.equal(response.status, 201, await response.clone().text());
  };
  const giveBackRequest = (copy: string, librarian = lita()) => h.send("POST", "/desk/returns", librarian.accessToken, { copy });
  const giveBack = async (copy: string) => {
    const response = await giveBackRequest(copy);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as RecordReturnResponse).loan;
  };

  /**
   * What must hold for a Book however requests interleave: every set-aside Copy has exactly
   * one ready Hold and every ready Hold a set-aside Copy of its own, and no Hold is left
   * waiting while a Copy sits available.
   */
  const assertConsistent = async (bookId: string) => {
    const { rows } = await h.api().db.query(
      `select
         (select count(*)::int from public.copies c
           where c.book_id = $1 and c.status = 'set_aside'
             and (select count(*) from public.holds r where r.copy_id = c.id and r.status = 'ready') <> 1) as set_aside_without_one_ready_hold,
         (select count(*)::int from public.holds r
            left join public.copies c on c.id = r.copy_id
           where r.book_id = $1 and r.status = 'ready' and c.status is distinct from 'set_aside') as ready_without_set_aside_copy,
         (select count(*)::int from public.holds w
           where w.book_id = $1 and w.status = 'waiting'
             and exists (select 1 from public.copies c where c.book_id = $1 and c.status = 'available')) as waiting_beside_available_copy`,
      [bookId],
    );
    assert.deepEqual(rows[0], { set_aside_without_one_ready_hold: 0, ready_without_set_aside_copy: 0, waiting_beside_available_copy: 0 });
  };

  /**
   * Runs `work` while another transaction holds the audit log. A return, a Loan, a dispatch and an
   * expiry write the log last (or close to it), so each started inside `work` has done everything
   * but commit, and keeps its row locks, until `work` ends. This fixes the order of a race.
   */
  const whileAuditLogIsHeld = async <T>(work: () => Promise<T>): Promise<T> => {
    const blocker = await h.api().db.connect();
    try {
      await blocker.query("begin");
      await createAuditLog(h.api()).record(
        { type: "sign_in_failed", subject: null, data: { portal: "member", reason: "refused", clientAddress: null } },
        blocker,
      );
      return await work();
    } finally {
      // Rolled back: the audit log keeps no trace of it.
      await blocker.query("rollback");
      blocker.release();
    }
  };

  const placeHold = async (member: TestMember, bookId: string): Promise<Hold> => {
    const response = await h.send("POST", "/holds", member.accessToken, { bookId });
    assert.equal(response.status, 201, await response.clone().text());
    return ((await response.json()) as PlaceHoldResponse).hold;
  };

  return {
    ...h,
    lita,
    assertConsistent,
    whileAuditLogIsHeld,
    start: async (options: Parameters<typeof h.start>[0] = {}) => {
      await h.start(options);
      state.librarian = await h.librarian();
    },
    lendRequest,
    lend,
    giveBackRequest,
    giveBack,
    /** A Book whose Copies are all out with `borrower`: the only way a Hold can be placed on it. */
    lentBook: async (title: string, borrower: TestMember, copies = 1): Promise<TestBook> => {
      const book = await h.addBook(title, Array<CopyStatus>(copies).fill("available"));
      for (const copy of book.copies) await lend(borrower, copy.barcode);
      return book;
    },
    placeHoldRequest: (member: TestMember, bookId: string) => h.send("POST", "/holds", member.accessToken, { bookId }),
    placeHold,
    cancelHold: (member: TestMember, holdId: string) => h.send("POST", `/holds/${holdId}/cancel`, member.accessToken),
    holdsOf: async (member: TestMember): Promise<Hold[]> => {
      const response = await h.send("GET", "/members/me/holds", member.accessToken);
      assert.equal(response.status, 200);
      return ((await response.json()) as MyHoldsResponse).holds;
    },
    holdOn: async (member: TestMember, bookId: string): Promise<Hold> => {
      const response = await h.send("GET", "/members/me/holds", member.accessToken);
      const hold = ((await response.json()) as MyHoldsResponse).holds.find((candidate) => candidate.bookId === bookId);
      assert.ok(hold, "the Member has no Hold on that Book");
      return hold;
    },
    availableCopies: async (member: TestMember, bookId: string): Promise<number> => {
      const response = await h.send("GET", `/catalog/books/${bookId}`, member.accessToken);
      assert.equal(response.status, 200);
      return ((await response.json()) as BookDetailResponse).book.availableCopies;
    },
    /** A Faculty or NTP / Employee Member, signed up through the API, with a Hold placed through `POST /holds`. */
    memberWithHold: async (accountType: Extract<AccountType, "faculty" | "ntp_employee">, firstName: string, bookId: string) => {
      const body = { firstName, lastName: "Garcia" };
      const member = await createTestMemberFromSignUp(
        h.api(),
        accountType === "faculty" ? facultySignUpBody(body) : ntpEmployeeSignUpBody(body),
      );
      await placeHold(member, bookId);
      return { email: member.email, name: `${firstName} Garcia` };
    },
  };
}
