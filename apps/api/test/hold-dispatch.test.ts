import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { LOAN_MESSAGES } from "@libras/shared";
import type { AccountType, BookDetailResponse, Hold, MyHoldsResponse, PlaceHoldResponse, RecordReturnResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember, createTestMemberFromSignUp, facultySignUpBody, ntpEmployeeSignUpBody } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { CopyStatus, TestBook, TestCopy, TestLibrarian } from "./loans-harness.ts";

/** What the Hold dispatch tests do on top of the Loan tests' harness: lend, give back, place and read Holds. */
function dispatchHarness() {
  const h = loansHarness();
  const state: { librarian?: TestLibrarian } = {};
  const lita = () => {
    if (!state.librarian) throw new Error("No Librarian is signed in");
    return state.librarian;
  };
  const lendRequest = async (member: TestMember, copy: string, librarian = lita()) =>
    h.send("POST", "/desk/loans", librarian.accessToken, { digitalId: await h.digitalIdOf(member), copy });
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

  const placeHold = async (member: TestMember, bookId: string): Promise<Hold> => {
    const response = await h.send("POST", "/holds", member.accessToken, { bookId });
    assert.equal(response.status, 201, await response.clone().text());
    return ((await response.json()) as PlaceHoldResponse).hold;
  };

  return {
    ...h,
    lita,
    start: async () => {
      await h.start();
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

describe("Hold dispatch when a Copy is returned", () => {
  const h = dispatchHarness();
  let ana: TestMember;
  let ben: TestMember;
  let carla: TestMember;

  before(async () => {
    await h.start();
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    carla = await createTestMember(h.api(), { firstName: "Carla", lastName: "Diaz" });
  });
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  it("makes the waiting Hold ready and sets the returned Copy aside for its Member for the Pickup Window", async () => {
    const book = await h.lentBook("Set Aside For Ben", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    h.api().clock.advance({ hours: 3 });

    const returned = await h.giveBack(copy.barcode);

    // 24 hours, the seeded Pickup Window, from the return at 13:00 in Manila.
    assert.deepEqual(returned.heldFor, { memberName: "Ben Cruz", pickupEndsAt: "2026-11-13T05:00:00.000Z" });
    const hold = await h.holdOn(ben, book.id);
    assert.equal(hold.status, "ready");
    assert.equal(hold.pickupEndsAt, "2026-11-13T05:00:00.000Z");
    // Set aside is not available: nobody is sent to the desk for it, and the next Member can still place a Hold.
    assert.equal(await h.availableCopies(carla, book.id), 0);
    assert.equal((await h.placeHoldRequest(carla, book.id)).status, 201);
  });

  it("simply makes the Copy available when no Hold is waiting, also after a Hold was cancelled", async () => {
    const book = await h.lentBook("Nobody Waiting", ana);
    const hold = await h.placeHold(ben, book.id);
    assert.equal((await h.cancelHold(ben, hold.id)).status, 200);

    const returned = await h.giveBack((book.copies[0] as TestCopy).barcode);

    assert.equal(returned.heldFor, null);
    assert.equal(await h.availableCopies(carla, book.id), 1);
    assert.equal((await h.holdOn(ben, book.id)).status, "cancelled");
    assert.equal(h.api().emails.sent.length, 0);
  });

  it("emails the Member that their Hold is ready, with the Book and the end of the Pickup Window, and nobody else", async () => {
    const book = await h.lentBook("Algorithms Unlocked", ana);
    await h.placeHold(ben, book.id);
    await h.placeHold(carla, book.id);

    await h.giveBack((book.copies[0] as TestCopy).barcode);

    assert.equal(h.api().emails.sent.length, 1);
    const email = h.api().emails.lastTo(ben.email);
    assert.ok(email, "Ben got no email");
    assert.equal(email.subject, "Your LIBRAS Hold is ready for pickup");
    assert.match(email.text, /Your Hold on "Algorithms Unlocked" is ready for pickup/);
    // Returned at 10:00 on 12 Nov in Manila: the Pickup Window ends 24 hours later.
    assert.match(email.text, /set aside for you at the library desk until Nov 13, 2026, 10:00 AM/);
    assert.match(email.text, /Show your Digital ID to the librarian/);
  });

  it("still records the return and the ready Hold when the email cannot be sent", async () => {
    const book = await h.lentBook("Email Is Down", ana);
    await h.placeHold(ben, book.id);
    const emails = h.api().emails;
    const send = emails.send.bind(emails);
    emails.send = () => Promise.reject(new Error("the email service is down"));
    try {
      const returned = await h.giveBack((book.copies[0] as TestCopy).barcode);
      assert.equal(returned.heldFor?.memberName, "Ben Cruz");
    } finally {
      emails.send = send;
    }
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
  });

  it("serves Holds by arrival time minus the role weight: Faculty 24 hours, NTP / Employee 12 hours, UMAK Student 0", async () => {
    const dan = await createTestMember(h.api(), { firstName: "Dan", lastName: "Lim" });
    h.api().emails.clear();
    const book = await h.addBook("Weighted Queue", Array<CopyStatus>(5).fill("available"));
    for (const [i, copy] of book.copies.entries()) await h.lend(i < 3 ? ana : ben, copy.barcode);

    // Two UMAK Students at the same instant: the earlier request is first.
    await h.placeHold(carla, book.id);
    await h.placeHold(dan, book.id);
    // An NTP / Employee 6 hours later counts as 6 hours before them.
    h.api().clock.advance({ hours: 6 });
    await h.memberWithHold("ntp_employee", "Nora", book.id);
    // A Faculty member 20 hours after the students counts as 4 hours before them, and after the NTP / Employee.
    h.api().clock.advance({ hours: 14 });
    await h.memberWithHold("faculty", "Fe", book.id);
    // A Faculty member 30 hours after the students is beyond the 24-hour weight: after them.
    h.api().clock.advance({ hours: 10 });
    const flor = await h.memberWithHold("faculty", "Flor", book.id);

    h.api().emails.clear();
    const served: (string | undefined)[] = [];
    for (const copy of book.copies) served.push((await h.giveBack(copy.barcode)).heldFor?.memberName);

    assert.deepEqual(served, ["Nora Garcia", "Fe Garcia", "Carla Diaz", "Dan Lim", "Flor Garcia"]);
    assert.equal(h.api().emails.sent.length, 5);
    assert.ok(h.api().emails.lastTo(flor.email), "the Faculty member got no email");
  });

  it("takes the Pickup Window length from the stored setting", async () => {
    const book = await h.lentBook("Longer Window", ana);
    await h.placeHold(ben, book.id);
    await h.api().db.query("update public.library_settings set pickup_window_hours = 48");
    try {
      const returned = await h.giveBack((book.copies[0] as TestCopy).barcode);
      assert.equal(returned.heldFor?.pickupEndsAt, "2026-11-14T02:00:00.000Z");
    } finally {
      await h.api().db.query("update public.library_settings set pickup_window_hours = 24");
    }
  });

  it("refuses a Loan of the set-aside Copy to any other Member, with the reason", async () => {
    const book = await h.lentBook("Not For Carla", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);

    for (const other of [carla, ana]) {
      const response = await h.lendRequest(other, copy.barcode);
      assert.deepEqual(await refusal(response), { status: 409, code: "copy_set_aside", message: LOAN_MESSAGES.copySetAside });
    }
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
    assert.equal((await h.loansOf(carla)).some((loan) => loan.bookId === book.id), false);
  });

  it("lends the set-aside Copy to its Member and marks their Hold fulfilled", async () => {
    const book = await h.lentBook("For Ben Only", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 5 });

    const response = await h.lendRequest(ben, copy.accessionNumber);

    assert.equal(response.status, 201);
    const hold = await h.holdOn(ben, book.id);
    assert.equal(hold.status, "fulfilled");
    assert.equal((await h.loansOf(ben)).filter((loan) => loan.bookId === book.id && loan.returnedAt === null).length, 1);
    // The Hold is over: when Ben brings the Copy back with nobody waiting, it is simply available.
    assert.equal((await h.giveBack(copy.barcode)).heldFor, null);
    assert.equal(await h.availableCopies(carla, book.id), 1);
  });

  it("lets the Member of a ready Hold borrow another Copy of the Book without touching their Hold", async () => {
    const book = await h.lentBook("Two Copies", ana, 2);
    const [first, second] = book.copies as [TestCopy, TestCopy];
    await h.placeHold(ben, book.id);
    await h.giveBack(first.barcode);
    // The second Copy comes back with nobody else waiting: it is available to anyone.
    assert.equal((await h.giveBack(second.barcode)).heldFor, null);

    assert.equal((await h.lendRequest(carla, second.barcode)).status, 201);
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
    assert.equal((await h.lendRequest(ben, first.barcode)).status, 201);
    assert.equal((await h.holdOn(ben, book.id)).status, "fulfilled");
  });

  it("records each Hold dispatch in the audit log, and none when no Hold was waiting", async () => {
    const audit = createAuditLog(h.api());
    const book = await h.lentBook("Audited Dispatch", ana);
    const copy = book.copies[0] as TestCopy;
    const hold = await h.placeHold(ben, book.id);
    const before = (await audit.newest())?.seq ?? 0;

    await h.giveBack(copy.barcode);
    assert.equal((await h.lendRequest(ben, copy.barcode)).status, 201);
    await h.giveBack(copy.barcode);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.data.copyId === copy.id);
    assert.deepEqual(
      entries.map((entry) => entry.type),
      ["hold_dispatched", "copy_returned", "loan_confirmed", "copy_returned"],
    );
    const dispatched = entries[0];
    assert.equal(dispatched?.actorId, h.lita().userId);
    assert.equal(dispatched?.subject, hold.id);
    assert.deepEqual(dispatched?.data, {
      memberId: ben.member.id,
      copyId: copy.id,
      bookId: book.id,
      accessionNumber: copy.accessionNumber,
      pickupEndsAt: "2026-11-13T02:00:00.000Z",
      cause: "copy_returned",
    });
    assert.equal((await audit.verify()).intact, true);
  });
});

describe("Cancelling a ready Hold", () => {
  const h = dispatchHarness();
  let ana: TestMember;
  let ben: TestMember;
  let carla: TestMember;

  before(async () => {
    await h.start();
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    carla = await createTestMember(h.api(), { firstName: "Carla", lastName: "Diaz" });
  });
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  it("passes the set-aside Copy on to the next waiting Hold, with a Pickup Window of its own", async () => {
    const audit = createAuditLog(h.api());
    const book = await h.lentBook("Passed On", ana);
    const copy = book.copies[0] as TestCopy;
    const bens = await h.placeHold(ben, book.id);
    const carlas = await h.placeHold(carla, book.id);
    await h.giveBack(copy.barcode);
    h.api().emails.clear();
    h.api().clock.advance({ hours: 2 });
    const before = (await audit.newest())?.seq ?? 0;

    const response = await h.cancelHold(ben, bens.id);

    assert.equal(response.status, 200);
    assert.equal((await h.holdOn(ben, book.id)).status, "cancelled");
    const next = await h.holdOn(carla, book.id);
    assert.equal(next.status, "ready");
    // 24 hours from the cancel at 12:00 on 12 Nov in Manila, not from the return.
    assert.equal(next.pickupEndsAt, "2026-11-13T04:00:00.000Z");
    assert.match(h.api().emails.lastTo(carla.email)?.text ?? "", /until Nov 13, 2026, 12:00 PM/);
    assert.equal(h.api().emails.sent.length, 1);
    // The Copy is now Carla's to borrow, and no longer Ben's.
    assert.equal((await refusal(await h.lendRequest(ben, copy.barcode))).code, "copy_set_aside");
    assert.equal((await h.lendRequest(carla, copy.barcode)).status, 201);
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "hold_dispatched");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, ben.member.id);
    assert.equal(entries[0]?.subject, carlas.id);
    assert.equal(entries[0]?.data.cause, "hold_cancelled");
  });

  it("frees the set-aside Copy when no other Hold is waiting", async () => {
    const book = await h.lentBook("Freed", ana);
    const copy = book.copies[0] as TestCopy;
    const hold = await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    assert.equal(await h.availableCopies(carla, book.id), 0);

    const response = await h.cancelHold(ben, hold.id);

    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { hold: Hold }).hold.status, "cancelled");
    assert.equal(await h.availableCopies(carla, book.id), 1);
    assert.equal((await h.lendRequest(carla, copy.barcode)).status, 201);
  });

  it("refuses to cancel a Hold that is fulfilled or already cancelled", async () => {
    const book = await h.lentBook("Too Late To Cancel", ana);
    const copy = book.copies[0] as TestCopy;
    const hold = await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    assert.equal((await h.lendRequest(ben, copy.barcode)).status, 201);

    assert.equal((await refusal(await h.cancelHold(ben, hold.id))).code, "hold_not_cancellable");
    const other = await h.placeHold(carla, book.id);
    assert.equal((await h.cancelHold(carla, other.id)).status, 200);
    assert.equal((await refusal(await h.cancelHold(carla, other.id))).code, "hold_not_cancellable");
  });
});

describe("Hold dispatch at the same moment", () => {
  const h = dispatchHarness();
  let omar: TestLibrarian;
  let lenders: TestMember[];
  let waiters: TestMember[];

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
  const statusesOf = (responses: Response[]) => responses.map((response) => response.status);
  const dispatchesOf = async (afterSeq: number, bookId: string) =>
    (await createAuditLog(h.api()).entries({ afterSeq, limit: 1000 })).filter(
      (entry) => entry.type === "hold_dispatched" && entry.data.bookId === bookId,
    );

  before(async () => {
    await h.start();
    omar = await h.librarian("Omar Cruz");
    lenders = await Promise.all([1, 2].map((n) => createTestMember(h.api(), { firstName: "Lender", lastName: `L${n}` })));
    waiters = [];
    for (const n of [1, 2, 3, 4, 5, 6]) waiters.push(await createTestMember(h.api(), { firstName: "Waiter", lastName: `W${n}` }));
  });
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  /** A Book with four Copies, all out: two with each lender. */
  const fourCopiesOut = async (title: string) => {
    const book = await h.addBook(title, Array<CopyStatus>(4).fill("available"));
    for (const [i, copy] of book.copies.entries()) await h.lend(lenders[i % 2] as TestMember, copy.barcode);
    return book;
  };
  const returnAll = (book: TestBook, librarians: TestLibrarian[]) =>
    Promise.all(book.copies.map((copy, i) => h.giveBackRequest(copy.barcode, librarians[i % librarians.length])));

  it("dispatches each Hold exactly once when several Copies of one Book are returned at once", async () => {
    const audit = createAuditLog(h.api());
    for (let round = 0; round < 6; round += 1) {
      const book = await fourCopiesOut(`All Back At Once ${round}`);
      // Six Members wait, in this order, for four Copies.
      const holds: Hold[] = [];
      for (const waiter of waiters) {
        h.api().clock.advance({ minutes: 1 });
        holds.push(await h.placeHold(waiter, book.id));
      }
      const before = (await audit.newest())?.seq ?? 0;
      h.api().emails.clear();

      // Each Copy is scanned at both desks at the same moment.
      const responses = await Promise.all([returnAll(book, [h.lita(), omar]), returnAll(book, [omar, h.lita()])]);

      assert.deepEqual(statusesOf(responses.flat()).sort(), [200, 200, 200, 200, 409, 409, 409, 409]);
      const after = await Promise.all(waiters.map((waiter) => h.holdOn(waiter, book.id)));
      // The four Members at the head of the queue are ready, the other two still wait.
      assert.deepEqual(
        after.map((hold) => hold.status),
        ["ready", "ready", "ready", "ready", "waiting", "waiting"],
      );
      const dispatches = await dispatchesOf(before, book.id);
      assert.equal(dispatches.length, 4);
      assert.deepEqual(dispatches.map((entry) => entry.subject).sort(), holds.slice(0, 4).map((hold) => hold.id).sort());
      assert.equal(new Set(dispatches.map((entry) => entry.data.copyId)).size, 4);
      // One email each, to the four Members who are ready.
      assert.deepEqual(h.api().emails.sent.map((email) => email.to).sort(), waiters.slice(0, 4).map((waiter) => waiter.email).sort());
      await assertConsistent(book.id);
    }
    assert.equal((await audit.verify()).intact, true);
  });

  it("frees the Copies that are left over when more come back at once than Holds are waiting", async () => {
    for (let round = 0; round < 4; round += 1) {
      const book = await fourCopiesOut(`More Copies Than Holds ${round}`);
      const [first, second] = waiters as [TestMember, TestMember];
      await h.placeHold(first, book.id);
      await h.placeHold(second, book.id);
      h.api().emails.clear();

      const responses = await returnAll(book, [h.lita(), omar]);

      assert.deepEqual(statusesOf(responses), [200, 200, 200, 200]);
      const heldFor = (await Promise.all(responses.map((response) => response.json() as Promise<RecordReturnResponse>))).map(
        (body) => body.loan.heldFor?.memberName ?? "nobody",
      );
      assert.deepEqual(heldFor.sort(), ["Waiter W1", "Waiter W2", "nobody", "nobody"]);
      assert.equal(await h.availableCopies(first, book.id), 2);
      assert.deepEqual(h.api().emails.sent.map((email) => email.to).sort(), [first.email, second.email].sort());
      await assertConsistent(book.id);
    }
  });

  it("never loses the Copy when its return races the cancelling of the Hold it would go to", async () => {
    for (let round = 0; round < 12; round += 1) {
      const withSecondHold = round % 2 === 0;
      const book = await h.lentBook(`Return Against Cancel ${round}`, lenders[0] as TestMember);
      const copy = book.copies[0] as TestCopy;
      const [first, second, bystander] = waiters as [TestMember, TestMember, TestMember];
      const chosen = await h.placeHold(first, book.id);
      if (withSecondHold) await h.placeHold(second, book.id);
      h.api().emails.clear();

      const [returned, cancelled] = await Promise.all([h.giveBackRequest(copy.barcode), h.cancelHold(first, chosen.id)]);

      // Both always succeed: a waiting Hold and a ready Hold can both be cancelled.
      assert.deepEqual([returned.status, cancelled.status], [200, 200]);
      assert.equal((await h.holdOn(first, book.id)).status, "cancelled");
      if (withSecondHold) {
        // Whichever came first, the Copy ends up set aside for the next Member, who is told once.
        assert.equal((await h.holdOn(second, book.id)).status, "ready");
        assert.equal(h.api().emails.sent.filter((email) => email.to === second.email).length, 1);
        await assertConsistent(book.id);
        assert.equal((await refusal(await h.lendRequest(bystander, copy.barcode))).code, "copy_set_aside");
        assert.equal((await h.lendRequest(second, copy.barcode)).status, 201);
      } else {
        // Nobody else waits: the Copy is back on the shelf for anyone.
        await assertConsistent(book.id);
        assert.equal(await h.availableCopies(bystander, book.id), 1);
        assert.equal((await h.lendRequest(bystander, copy.barcode)).status, 201);
      }
      await h.giveBack(copy.barcode);
    }
  });

  it("gives a Copy that is being returned only to the Member its Hold is for, when Loans are confirmed at the same moment", async () => {
    for (let round = 0; round < 8; round += 1) {
      const book = await h.lentBook(`Return Against Loans ${round}`, lenders[0] as TestMember);
      const copy = book.copies[0] as TestCopy;
      const [holder, other] = waiters as [TestMember, TestMember];
      await h.placeHold(holder, book.id);

      const [returned, toHolder, toOther] = await Promise.all([
        h.giveBackRequest(copy.barcode),
        h.lendRequest(holder, copy.barcode),
        h.lendRequest(other, copy.accessionNumber),
      ]);

      assert.equal(returned.status, 200);
      // The other Member never gets it: it is on Loan before the return and set aside after it.
      assert.equal(toOther.status, 409);
      assert.ok(["copy_on_loan", "copy_set_aside"].includes((await refusal(toOther)).code));
      const hold = await h.holdOn(holder, book.id);
      if (toHolder.status === 201) {
        assert.equal(hold.status, "fulfilled");
      } else {
        assert.equal((await refusal(toHolder)).code, "copy_on_loan");
        assert.equal(hold.status, "ready");
        await assertConsistent(book.id);
        assert.equal((await h.lendRequest(holder, copy.barcode)).status, 201);
      }
      assert.equal((await h.loansOf(holder)).filter((loan) => loan.bookId === book.id && loan.returnedAt === null).length, 1);
      assert.equal((await h.loansOf(other)).some((loan) => loan.bookId === book.id), false);
      await assertConsistent(book.id);
      await h.giveBack(copy.barcode);
    }
  });

  it("either lends the set-aside Copy to its Member or passes it on, never both, when the Loan races the cancelling of the ready Hold", async () => {
    for (let round = 0; round < 12; round += 1) {
      const book = await h.lentBook(`Loan Against Cancel ${round}`, lenders[0] as TestMember);
      const copy = book.copies[0] as TestCopy;
      const [holder, next] = waiters as [TestMember, TestMember];
      const ready = await h.placeHold(holder, book.id);
      await h.placeHold(next, book.id);
      await h.giveBack(copy.barcode);

      const [lent, cancelled] = await Promise.all([h.lendRequest(holder, copy.barcode), h.cancelHold(holder, ready.id)]);

      const mine = await h.holdOn(holder, book.id);
      const theirs = await h.holdOn(next, book.id);
      if (lent.status === 201) {
        // The Loan won: the Hold is fulfilled, the cancel is refused and the next Member still waits.
        assert.equal((await refusal(cancelled)).code, "hold_not_cancellable");
        assert.deepEqual([mine.status, theirs.status], ["fulfilled", "waiting"]);
      } else {
        // The cancel won: the Copy went to the next Member and the Loan is refused.
        assert.equal(cancelled.status, 200);
        assert.equal((await refusal(lent)).code, "copy_set_aside");
        assert.deepEqual([mine.status, theirs.status], ["cancelled", "ready"]);
        assert.equal((await h.loansOf(holder)).some((loan) => loan.bookId === book.id && loan.returnedAt === null), false);
      }
      await assertConsistent(book.id);
      if (lent.status === 201) await h.giveBack(copy.barcode);
    }
  });

  it("never leaves a Hold waiting beside an available Copy when Holds are placed as the Copy is returned", async () => {
    for (let round = 0; round < 12; round += 1) {
      const book = await h.lentBook(`Holds Against Return ${round}`, lenders[0] as TestMember);
      const copy = book.copies[0] as TestCopy;

      const [returned, ...placed] = await Promise.all([
        h.giveBackRequest(copy.barcode),
        ...waiters.map((waiter) => h.placeHoldRequest(waiter, book.id)),
      ]);

      assert.equal(returned.status, 200);
      const heldFor = ((await returned.json()) as RecordReturnResponse).loan.heldFor;
      const statuses: string[] = [];
      for (const [i, response] of placed.entries()) {
        if (response.status === 201) {
          statuses.push((await h.holdOn(waiters[i] as TestMember, book.id)).status);
        } else {
          // The Copy was back and free before this Member asked: there is nothing to wait for.
          assert.equal((await refusal(response)).code, "copy_available");
          statuses.push("refused");
        }
      }
      if (heldFor) {
        // A Hold was in the queue when the Copy came back: one Member is ready, and the rest wait for a set-aside Copy.
        assert.equal(statuses.filter((status) => status === "ready").length, 1);
        assert.equal(statuses.filter((status) => status === "waiting").length, waiters.length - 1);
        assert.equal(await h.availableCopies(waiters[0] as TestMember, book.id), 0);
      } else {
        // The Copy came back to an empty queue: it is available, so nobody is left waiting for it.
        assert.deepEqual(statuses, Array(waiters.length).fill("refused"));
        assert.equal(await h.availableCopies(waiters[0] as TestMember, book.id), 1);
      }
      await assertConsistent(book.id);
    }
  });

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /**
   * Runs `work` while another transaction holds the audit log. A return, a Loan and a
   * dispatch write the log last, so each started inside `work` has done everything but
   * commit, and keeps its row locks, until `work` ends. This fixes the order of a race.
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
  /** Starts a request and tells whether it has been answered yet. */
  const started = (request: Promise<Response>) => {
    const call = { response: request, answered: false };
    void request.then(() => {
      call.answered = true;
    });
    return call;
  };

  it("makes a Hold placed while a return is still being recorded wait for it, so the Hold is never left behind", async () => {
    const book = await h.lentBook("Placed During The Return", lenders[0] as TestMember);
    const copy = book.copies[0] as TestCopy;
    const waiter = waiters[0] as TestMember;

    // The return has found no Hold and freed the Copy, but has not committed.
    const { returning, placing } = await whileAuditLogIsHeld(async () => {
      const returning = started(h.giveBackRequest(copy.barcode));
      await pause(400);
      const placing = started(h.placeHoldRequest(waiter, book.id));
      await pause(400);
      // The Hold cannot be answered yet: whether a Copy is available is not known until the return ends.
      assert.deepEqual([returning.answered, placing.answered], [false, false]);
      return { returning, placing };
    });

    assert.equal((await returning.response).status, 200);
    assert.equal((await refusal(await placing.response)).code, "copy_available");
    assert.equal(await h.availableCopies(waiter, book.id), 1);
    await assertConsistent(book.id);
  });

  for (const withSecondHold of [true, false]) {
    it(`passes the Copy on when a Hold is cancelled while the return that chose it is still being recorded${withSecondHold ? "" : ", or frees it with nobody else waiting"}`, async () => {
      const book = await h.lentBook(`Cancelled During The Return ${withSecondHold}`, lenders[0] as TestMember);
      const copy = book.copies[0] as TestCopy;
      const [first, second, bystander] = waiters as [TestMember, TestMember, TestMember];
      const chosen = await h.placeHold(first, book.id);
      if (withSecondHold) await h.placeHold(second, book.id);

      // The return has chosen the first Hold and set the Copy aside for it, but has not committed:
      // the Member still sees a waiting Hold and cancels it.
      const { returning, cancelling } = await whileAuditLogIsHeld(async () => {
        const returning = started(h.giveBackRequest(copy.barcode));
        await pause(400);
        const cancelling = started(h.cancelHold(first, chosen.id));
        await pause(400);
        assert.deepEqual([returning.answered, cancelling.answered], [false, false]);
        return { returning, cancelling };
      });

      const returned = await returning.response;
      assert.equal(returned.status, 200);
      assert.equal(((await returned.json()) as RecordReturnResponse).loan.heldFor?.memberName, "Waiter W1");
      assert.equal((await cancelling.response).status, 200);
      assert.equal((await h.holdOn(first, book.id)).status, "cancelled");
      await assertConsistent(book.id);
      if (withSecondHold) {
        assert.equal((await h.holdOn(second, book.id)).status, "ready");
        assert.equal(h.api().emails.sent.filter((email) => email.to === second.email).length, 1);
        assert.equal((await h.lendRequest(second, copy.barcode)).status, 201);
      } else {
        assert.equal(await h.availableCopies(bystander, book.id), 1);
        assert.equal((await h.lendRequest(bystander, copy.barcode)).status, 201);
      }
      await h.giveBack(copy.barcode);
    });
  }

  it("refuses to cancel a ready Hold whose Copy is being lent to its Member at that moment", async () => {
    const book = await h.lentBook("Cancelled During The Loan", lenders[0] as TestMember);
    const copy = book.copies[0] as TestCopy;
    const [holder, next] = waiters as [TestMember, TestMember];
    const ready = await h.placeHold(holder, book.id);
    await h.placeHold(next, book.id);
    await h.giveBack(copy.barcode);

    // The Loan has fulfilled the Hold and taken the Copy, but has not committed.
    const { lending, cancelling } = await whileAuditLogIsHeld(async () => {
      const lending = started(h.lendRequest(holder, copy.barcode));
      await pause(400);
      const cancelling = started(h.cancelHold(holder, ready.id));
      await pause(400);
      assert.deepEqual([lending.answered, cancelling.answered], [false, false]);
      return { lending, cancelling };
    });

    assert.equal((await lending.response).status, 201);
    assert.equal((await refusal(await cancelling.response)).code, "hold_not_cancellable");
    assert.equal((await h.holdOn(holder, book.id)).status, "fulfilled");
    assert.equal((await h.holdOn(next, book.id)).status, "waiting");
    await assertConsistent(book.id);
    await h.giveBack(copy.barcode);
  });

  it("refuses the Loan of a set-aside Copy to a Member whose cancel of the ready Hold is passing it on at that moment", async () => {
    const book = await h.lentBook("Lent During The Cancel", lenders[0] as TestMember);
    const copy = book.copies[0] as TestCopy;
    const [holder, next] = waiters as [TestMember, TestMember];
    const ready = await h.placeHold(holder, book.id);
    await h.placeHold(next, book.id);
    await h.giveBack(copy.barcode);

    // The cancel has passed the Copy on to the next Hold, but has not committed.
    const { lending, cancelling } = await whileAuditLogIsHeld(async () => {
      const cancelling = started(h.cancelHold(holder, ready.id));
      await pause(400);
      const lending = started(h.lendRequest(holder, copy.barcode));
      await pause(400);
      assert.deepEqual([cancelling.answered, lending.answered], [false, false]);
      return { lending, cancelling };
    });

    assert.equal((await cancelling.response).status, 200);
    assert.equal((await refusal(await lending.response)).code, "copy_set_aside");
    assert.equal((await h.holdOn(holder, book.id)).status, "cancelled");
    assert.equal((await h.holdOn(next, book.id)).status, "ready");
    assert.equal((await h.loansOf(holder)).some((loan) => loan.bookId === book.id && loan.returnedAt === null), false);
    await assertConsistent(book.id);
  });
});
