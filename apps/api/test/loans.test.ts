import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { LOAN_MESSAGES } from "@libras/shared";
import type {
  BookDetailResponse,
  CatalogSearchResponse,
  ConfirmLoanResponse,
  IdentifyMemberResponse,
} from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { withIdentity } from "../src/auth/index.ts";
import { createTestMember, createTestMemberOfType } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { CopyStatus, TestCopy, TestLibrarian } from "./loans-harness.ts";

describe("Confirming a Loan at the desk", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let ana: TestMember;

  /** The Librarian scans the Member's Digital ID, then the Copy. */
  const confirm = (member: TestMember, copy: string, librarian = lita) => h.lendAtDesk(librarian, member, copy);

  before(async () => {
    await h.start();
    lita = await h.librarian();
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
  });
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  it("records the Loan with a due date from the Loan Policy, and the Member sees it in My Loans", async () => {
    const member = await createTestMember(h.api(), { firstName: "Bea", lastName: "Cruz" });
    const book = await h.addBook("Data Structures In Practice");
    const copy = book.copies[0] as TestCopy;

    const response = await confirm(member, copy.barcode);

    assert.equal(response.status, 201);
    const body = (await response.json()) as ConfirmLoanResponse;
    // UMAK Student: 7 days, due at the end of 19 Nov in Manila.
    assert.deepEqual(
      { ...body.loan, id: "" },
      {
        id: "",
        bookTitle: "Data Structures In Practice",
        accessionNumber: copy.accessionNumber,
        checkedOutAt: "2026-11-12T02:00:00.000Z",
        dueAt: "2026-11-19T15:59:59.999Z",
      },
    );
    assert.deepEqual(body.member, {
      id: member.member.id,
      fullName: "Bea Cruz",
      accountType: "umak_student",
      loans: { current: 1, limit: 3, loanPeriodDays: 7 },
    });
    assert.deepEqual(await h.loansOf(member), [
      {
        id: body.loan.id,
        bookId: book.id,
        bookTitle: "Data Structures In Practice",
        bookAuthors: ["Reyes, Ana"],
        accessionNumber: copy.accessionNumber,
        checkedOutAt: "2026-11-12T02:00:00.000Z",
        dueAt: "2026-11-19T15:59:59.999Z",
        returnedAt: null,
        overdue: false,
      },
    ]);
  });

  it("makes the count of available Copies fall, on the Book page, in search and for the Hold action", async () => {
    const member = await createTestMember(h.api());
    const word = `zq${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const book = await h.addBook(`The ${word} Handbook`, ["available", "available"]);
    const available = async () =>
      ((await (await h.send("GET", `/catalog/books/${book.id}`, ana.accessToken)).json()) as BookDetailResponse).book.availableCopies;
    const found = async () =>
      ((await (await h.send("GET", `/catalog/search?q=${word}`, ana.accessToken)).json()) as CatalogSearchResponse).results[0];
    assert.equal(await available(), 2);
    assert.equal((await eventually(found, (result) => result !== undefined))?.availableCopies, 2);
    assert.equal((await h.send("POST", "/holds", ana.accessToken, { bookId: book.id })).status, 409);

    assert.equal((await confirm(member, (book.copies[0] as TestCopy).barcode)).status, 201);
    assert.equal(await available(), 1);
    assert.equal((await found())?.availableCopies, 1);

    assert.equal((await confirm(member, (book.copies[1] as TestCopy).barcode)).status, 201);
    assert.equal(await available(), 0);
    assert.equal((await found())?.availableCopies, 0);
    // With no Copy left on the shelf, another Member may place a Hold.
    assert.equal((await h.send("POST", "/holds", ana.accessToken, { bookId: book.id })).status, 201);
    await h.api().db.query("delete from public.holds where book_id = $1", [book.id]);
  });

  it("accepts the accession number typed by hand, in either case, when the barcode cannot be read", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Worn Label", ["available", "available"]);
    const [first, second] = book.copies as [TestCopy, TestCopy];

    const exact = await confirm(member, first.accessionNumber);
    const lower = await confirm(member, second.accessionNumber.toLowerCase());

    assert.equal(exact.status, 201);
    assert.equal(((await exact.json()) as ConfirmLoanResponse).loan.accessionNumber, first.accessionNumber);
    assert.equal(lower.status, 201);
    assert.equal(((await lower.json()) as ConfirmLoanResponse).loan.accessionNumber, second.accessionNumber);
  });

  it("lends several Copies in one visit on one scan of the Digital ID, and the desk then shows the Member's Loans against the limit", async () => {
    const member = await createTestMember(h.api(), { firstName: "Carlo", lastName: "Diaz" });
    const book = await h.addBook("Two At Once", ["available", "available"]);
    const digitalId = await h.digitalIdOf(member);
    const identified = (await (await h.identify(lita, digitalId)).json()) as IdentifyMemberResponse;

    for (const copy of book.copies) {
      const response = await h.lendWith(lita, identified.deskSession.token, copy.barcode);
      assert.equal(response.status, 201);
    }

    const again = await h.identify(lita, digitalId);
    assert.deepEqual(((await again.json()) as IdentifyMemberResponse).member.loans, { current: 2, limit: 3, loanPeriodDays: 7 });
  });

  it("refuses a Loan beyond the Member's loan limit, and says why", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Four Copies", ["available", "available", "available", "available"]);
    for (const copy of book.copies.slice(0, 3)) assert.equal((await confirm(member, copy.barcode)).status, 201);

    const fourth = await confirm(member, (book.copies[3] as TestCopy).barcode);

    assert.deepEqual(await refusal(fourth), { status: 409, code: "loan_limit_reached", message: LOAN_MESSAGES.limitReached });
    const mine = await h.myLoans(member);
    assert.deepEqual([mine.loans.length, mine.loanLimit, mine.loanPeriodDays], [3, 3, 7]);
    // The refused Copy stays on the shelf.
    const { rows } = await h.api().db.query("select status from public.copies where id = $1", [(book.copies[3] as TestCopy).id]);
    assert.equal(rows[0].status, "available");
  });

  for (const accountType of ["faculty", "ntp_employee"] as const) {
    it(`lends to a Member whose Account Type is ${accountType} under the same Loan Policy as a UMAK Student`, async () => {
      const member = await createTestMemberOfType(h.api(), accountType);
      const book = await h.addBook(`For ${accountType}`);

      const response = await confirm(member, (book.copies[0] as TestCopy).barcode);

      assert.equal(response.status, 201);
      const body = (await response.json()) as ConfirmLoanResponse;
      assert.equal(body.loan.dueAt, "2026-11-19T15:59:59.999Z");
      assert.equal(body.member.accountType, accountType);
      assert.deepEqual(await h.myLoans(member).then((mine) => [mine.loans.length, mine.loanLimit, mine.loanPeriodDays]), [1, 3, 7]);
    });
  }

  for (const accountType of ["visitor", "alumni"] as const) {
    it(`refuses a Loan to a Member whose Account Type is ${accountType}: it cannot borrow`, async () => {
      const member = await createTestMemberOfType(h.api(), accountType);
      const book = await h.addBook(`Not For ${accountType}`);

      const response = await confirm(member, (book.copies[0] as TestCopy).barcode);

      assert.deepEqual(await refusal(response), { status: 403, code: "cannot_borrow", message: LOAN_MESSAGES.cannotBorrow });
      assert.deepEqual(await h.myLoans(member), { loans: [], loanLimit: 0, loanPeriodDays: null });
    });
  }

  it("refuses a Copy that is already on Loan, to another Member and to the same one", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Only One Copy");
    const copy = book.copies[0] as TestCopy;
    assert.equal((await confirm(member, copy.barcode)).status, 201);

    const other = await confirm(ana, copy.barcode);
    const again = await confirm(member, copy.accessionNumber);

    assert.deepEqual(await refusal(other), { status: 409, code: "copy_on_loan", message: LOAN_MESSAGES.copyOnLoan });
    assert.equal((await refusal(again)).code, "copy_on_loan");
    assert.equal((await h.loansOf(ana)).some((loan) => loan.bookId === book.id), false);
    assert.equal((await h.loansOf(member)).length, 1);
  });

  it("refuses a Copy that is set aside for a Hold", async () => {
    const book = await h.addBook("On The Hold Shelf", ["set_aside"]);

    const response = await confirm(ana, (book.copies[0] as TestCopy).barcode);

    assert.deepEqual(await refusal(response), { status: 409, code: "copy_set_aside", message: LOAN_MESSAGES.copySetAside });
    assert.equal((await h.loansOf(ana)).some((loan) => loan.bookId === book.id), false);
  });

  it("gives clear feedback for a barcode or accession number that belongs to no Copy", async () => {
    for (const copy of ["3999999999", "AC-NOPE-0001", "48210937551"]) {
      const response = await confirm(ana, copy);
      assert.deepEqual(await refusal(response), { status: 404, code: "copy_not_found", message: LOAN_MESSAGES.copyNotFound }, copy);
    }
  });

  it("refuses a request that is not a desk session and a Copy code, before looking anything up", async () => {
    const book = await h.addBook("Malformed");
    const copy = (book.copies[0] as TestCopy).barcode;
    const deskSession = await h.deskSessionFor(ana, lita);
    for (const body of [
      {},
      { deskSession },
      { copy },
      { deskSession: "12345", copy },
      { deskSession: `${deskSession}x`, copy },
      // The Digital ID itself is no longer sent with each Copy.
      { digitalId: await h.digitalIdOf(ana), copy },
      { deskSession, copy: "" },
      { deskSession, copy: "3100<script>" },
      { deskSession, copy: "' or 1=1 --" },
      { deskSession, copy: "x".repeat(65) },
      { deskSession, copy: 3100000001 },
      { deskSession, copy, memberId: ana.member.id },
    ]) {
      const result = await refusal(await h.send("POST", "/desk/loans", lita.accessToken, body));
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.code, "invalid_request", JSON.stringify(body));
    }
    assert.equal((await h.loansOf(ana)).some((loan) => loan.bookId === book.id), false);
  });

  it("starts no desk session for a Digital ID that has expired or is not valid, so no Loan can follow", async () => {
    const member = await createTestMember(h.api());
    const digitalId = await h.digitalIdOf(member);
    const wrong = digitalId.slice(0, 6) + String((Number(digitalId.slice(6)) + 1) % 1_000_000).padStart(6, "0");

    const invalid = await h.identify(lita, wrong);
    h.api().clock.advance({ minutes: 3 });
    const expired = await h.identify(lita, digitalId);

    assert.equal((await refusal(invalid)).code, "digital_id_invalid");
    assert.equal((await refusal(expired)).code, "digital_id_expired");
    assert.deepEqual(await h.loansOf(member), []);
  });

  it("refuses at another Librarian's desk a Digital ID already scanned at one desk", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Shown Twice", ["available", "available"]);
    const [first, second] = book.copies as [TestCopy, TestCopy];
    const otherDesk = await h.librarian("Omar Cruz");
    const digitalId = await h.digitalIdOf(member);
    const identified = (await (await h.identify(lita, digitalId)).json()) as IdentifyMemberResponse;

    const replayed = await h.identify(otherDesk, digitalId);

    assert.deepEqual(await refusal(replayed), { status: 409, code: "digital_id_used", message: LOAN_MESSAGES.digitalIdUsed });
    // The first desk lends with it as before, and the same Librarian may scan the same code again.
    assert.equal((await h.lendWith(lita, identified.deskSession.token, first.barcode)).status, 201);
    assert.equal((await h.identify(lita, digitalId)).status, 200);
    // The next code on the Member's phone works at the other desk.
    h.api().clock.advance({ minutes: 1 });
    assert.equal((await confirm(member, second.barcode, otherDesk)).status, 201);
  });

  it("lets only a Librarian confirm a Loan: a Member cannot create one, alone or for anyone", async () => {
    const book = await h.addBook("Self Service");
    const body = { deskSession: await h.deskSessionFor(ana, lita), copy: (book.copies[0] as TestCopy).barcode };

    const asMember = await h.send("POST", "/desk/loans", ana.accessToken, body);
    const signedOut = await h.send("POST", "/desk/loans", null, body);

    assert.deepEqual([asMember.status, (await asMember.json()).error.code], [403, "not_staff"]);
    assert.equal(signedOut.status, 401);
    assert.equal((await h.send("GET", "/members/me/loans", null)).status, 401);
    assert.equal((await h.send("GET", "/members/me/loans", lita.accessToken)).status, 403);
    assert.equal((await h.loansOf(ana)).some((loan) => loan.bookId === book.id), false);
  });

  it("records each confirmed Loan in the audit log, and nothing for a refused one", async () => {
    const audit = createAuditLog(h.api());
    const member = await createTestMember(h.api());
    const book = await h.addBook("For The Record");
    const copy = book.copies[0] as TestCopy;
    const before = (await audit.newest())?.seq ?? 0;

    const confirmed = (await (await confirm(member, copy.barcode)).json()) as ConfirmLoanResponse;
    assert.equal((await confirm(ana, copy.barcode)).status, 409);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "loan_confirmed");
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry?.actorId, lita.userId);
    assert.equal(entry?.subject, confirmed.loan.id);
    assert.equal(entry?.occurredAt.toISOString(), "2026-11-12T02:00:00.000Z");
    assert.deepEqual(entry?.data, {
      memberId: member.member.id,
      copyId: copy.id,
      bookId: book.id,
      accessionNumber: copy.accessionNumber,
      dueAt: "2026-11-19T15:59:59.999Z",
    });
    assert.equal((await audit.verify()).intact, true);
  });
});

describe("The desk session: one scan of the Digital ID lends every Copy of the visit", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let omar: TestLibrarian;

  before(async () => {
    await h.start();
    lita = await h.librarian();
    omar = await h.librarian("Omar Cruz");
  });
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
  });

  it("starts when the Digital ID is scanned: a token for that Librarian and Member, ending 10 minutes later", async () => {
    const member = await createTestMember(h.api());

    const response = await h.identify(lita, await h.digitalIdOf(member));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { deskSession } = (await response.json()) as IdentifyMemberResponse;
    assert.match(deskSession.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(deskSession.expiresAt, "2026-11-12T02:10:00.000Z");
    // Unguessable: a second scan of the same code starts another session with another token.
    const again = (await (await h.identify(lita, await h.digitalIdOf(member))).json()) as IdentifyMemberResponse;
    assert.notEqual(again.deskSession.token, deskSession.token);
  });

  it("lends a Copy scanned long after the Digital ID itself has expired", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Slow Scan", ["available"]);
    const deskSession = await h.deskSessionFor(member, lita);

    // The code on the phone has changed several times: it is no longer accepted.
    h.api().clock.advance({ minutes: 5 });
    const response = await h.lendWith(lita, deskSession, (book.copies[0] as TestCopy).barcode);

    assert.equal(response.status, 201, await response.clone().text());
    assert.equal(((await response.json()) as ConfirmLoanResponse).member.id, member.member.id);
    assert.equal((await h.loansOf(member)).length, 1);
  });

  it("is renewed on each use, so a long visit goes on, and ends 10 minutes after the last use", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Long Visit", ["available", "available", "available"]);
    const [first, second, third] = book.copies as [TestCopy, TestCopy, TestCopy];
    const deskSession = await h.deskSessionFor(member, lita);

    h.api().clock.advance({ minutes: 9 });
    assert.equal((await h.lendWith(lita, deskSession, first.barcode)).status, 201);
    h.api().clock.advance({ minutes: 9 });
    assert.equal((await h.lendWith(lita, deskSession, second.barcode)).status, 201);
    h.api().clock.advance({ minutes: 10 });
    const late = await h.lendWith(lita, deskSession, third.barcode);

    assert.deepEqual(await refusal(late), { status: 409, code: "desk_session_ended", message: LOAN_MESSAGES.deskSessionEnded });
    assert.equal((await h.loansOf(member)).length, 2);
  });

  it("renews on a refused scan too: the Librarian is still serving the Member", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Refused Then Lent", ["available"]);
    const deskSession = await h.deskSessionFor(member, lita);

    h.api().clock.advance({ minutes: 8 });
    assert.equal((await refusal(await h.lendWith(lita, deskSession, "3999999997"))).code, "copy_not_found");
    h.api().clock.advance({ minutes: 8 });

    assert.equal((await h.lendWith(lita, deskSession, (book.copies[0] as TestCopy).barcode)).status, 201);
  });

  it("ends when the Librarian is done with the Member, and then lends nothing more", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Done With Them", ["available"]);
    const deskSession = await h.deskSessionFor(member, lita);

    const done = await h.endDeskSession(lita, deskSession);
    const after = await h.lendWith(lita, deskSession, (book.copies[0] as TestCopy).barcode);

    assert.equal(done.status, 204);
    assert.deepEqual(await refusal(after), { status: 409, code: "desk_session_ended", message: LOAN_MESSAGES.deskSessionEnded });
    assert.deepEqual(await h.loansOf(member), []);
    // Ending it again, or ending a session that never was, changes nothing and says nothing more.
    assert.equal((await h.endDeskSession(lita, deskSession)).status, 204);
  });

  it("belongs to the Librarian who scanned the Digital ID: another Librarian can neither use it nor end it", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Not Your Session", ["available", "available"]);
    const [first, second] = book.copies as [TestCopy, TestCopy];
    const deskSession = await h.deskSessionFor(member, lita);

    const elsewhere = await h.lendWith(omar, deskSession, first.barcode);
    assert.equal((await h.endDeskSession(omar, deskSession)).status, 204);

    assert.deepEqual(await refusal(elsewhere), { status: 409, code: "desk_session_ended", message: LOAN_MESSAGES.deskSessionEnded });
    assert.equal((await h.lendWith(lita, deskSession, second.barcode)).status, 201);
  });

  it("refuses a token that no desk session has, the same way", async () => {
    const book = await h.addBook("Made Up Token", ["available"]);

    const response = await h.lendWith(lita, "A".repeat(43), (book.copies[0] as TestCopy).barcode);

    assert.deepEqual(await refusal(response), { status: 409, code: "desk_session_ended", message: LOAN_MESSAGES.deskSessionEnded });
  });

  it("still checks every Loan rule at each Copy: the limit, the Account Type and the Copy", async () => {
    const member = await createTestMember(h.api());
    const visitor = await createTestMemberOfType(h.api(), "visitor");
    const book = await h.addBook("Rules Still Apply", ["available", "available", "available", "available", "set_aside"]);
    const [a, b, c, d, setAside] = book.copies as [TestCopy, TestCopy, TestCopy, TestCopy, TestCopy];
    const deskSession = await h.deskSessionFor(member, lita);

    for (const copy of [a, b, c]) assert.equal((await h.lendWith(lita, deskSession, copy.barcode)).status, 201);
    assert.equal((await refusal(await h.lendWith(lita, deskSession, d.barcode))).code, "loan_limit_reached");
    assert.equal((await refusal(await h.lendWith(lita, deskSession, a.barcode))).code, "loan_limit_reached");
    const visitorSession = await h.deskSessionFor(visitor, lita);
    assert.equal((await refusal(await h.lendWith(lita, visitorSession, setAside.barcode))).code, "cannot_borrow");
    assert.equal((await refusal(await h.lendWith(lita, visitorSession, a.barcode))).code, "cannot_borrow");
  });

  it("keeps its token out of PostgreSQL's reach for Members and Librarians", async () => {
    const member = await createTestMember(h.api());
    await h.deskSessionFor(member, lita);

    for (const identity of [
      { userId: member.member.id, email: member.email },
      { userId: lita.userId, email: "librarian@example.com" },
    ]) {
      const refused = await withIdentity(h.api().db, identity, async (scope) => {
        try {
          await scope.query("select * from public.desk_sessions");
          return false;
        } catch {
          return true;
        }
      });
      assert.equal(refused, true, identity.email);
    }
  });
});

describe("Confirming Loans at the same moment", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let omar: TestLibrarian;

  const confirmWith = (librarian: TestLibrarian, deskSession: string, copy: string) => h.lendWith(librarian, deskSession, copy);
  const openLoans = async (column: "copy_id" | "member_id", value: string) =>
    (await h.api().db.query(`select count(*)::int as count from public.loans where ${column} = $1 and returned_at is null`, [value])).rows[0].count;

  before(async () => {
    await h.start();
    lita = await h.librarian();
    omar = await h.librarian("Omar Cruz");
  });
  after(() => h.stop());

  it("gives one Copy to exactly one of two Members confirmed at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      const [ana, ben] = await Promise.all([createTestMember(h.api()), createTestMember(h.api())]);
      const book = await h.addBook(`Race For A Copy ${round}`);
      const copy = book.copies[0] as TestCopy;
      const [anasId, bensId] = await Promise.all([h.deskSessionFor(ana, lita), h.deskSessionFor(ben, omar)]);

      const responses = await Promise.all([confirmWith(lita, anasId, copy.barcode), confirmWith(omar, bensId, copy.accessionNumber)]);

      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      const refused = responses.find((response) => response.status === 409) as Response;
      assert.equal((await refusal(refused)).code, "copy_on_loan");
      assert.equal(await openLoans("copy_id", copy.id), 1);
      assert.equal((await h.loansOf(ana)).length + (await h.loansOf(ben)).length, 1);
    }
  });

  it("gives a Member their last allowed Loan exactly once when two Copies are confirmed at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      const member = await createTestMember(h.api());
      const book = await h.addBook(`Race For The Limit ${round}`, ["available", "available", "available", "available"]);
      const [first, second, third, fourth] = book.copies as [TestCopy, TestCopy, TestCopy, TestCopy];
      const deskSession = await h.deskSessionFor(member, lita);
      assert.equal((await confirmWith(lita, deskSession, first.barcode)).status, 201);
      assert.equal((await confirmWith(lita, deskSession, second.barcode)).status, 201);

      const responses = await Promise.all([confirmWith(lita, deskSession, third.barcode), confirmWith(lita, deskSession, fourth.barcode)]);

      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      const refused = responses.find((response) => response.status === 409) as Response;
      assert.equal((await refusal(refused)).code, "loan_limit_reached");
      assert.equal(await openLoans("member_id", member.member.id), 3);
      const { rows } = await h.api().db.query("select count(*)::int as count from public.copies where book_id = $1 and status = 'available'", [book.id]);
      assert.equal(rows[0].count, 1);
    }
  });

  it("never lets a burst of confirmations exceed the limit or lend a Copy twice", async () => {
    const audit = createAuditLog(h.api());
    const member = await createTestMember(h.api());
    const book = await h.addBook("Burst", Array<CopyStatus>(6).fill("available"));
    const deskSession = await h.deskSessionFor(member, lita);
    const before = (await audit.newest())?.seq ?? 0;

    // Every Copy twice, all at once: twelve requests for a Member who may hold three.
    const responses = await Promise.all(
      [...book.copies, ...book.copies].map((copy, i) => confirmWith(lita, deskSession, i < 6 ? copy.barcode : copy.accessionNumber)),
    );

    assert.equal(responses.filter((response) => response.status === 201).length, 3);
    assert.equal(responses.filter((response) => response.status === 409).length, 9);
    assert.equal(await openLoans("member_id", member.member.id), 3);
    const { rows } = await h.api().db.query(
      "select count(*)::int as loans, count(distinct copy_id)::int as copies from public.loans where member_id = $1",
      [member.member.id],
    );
    assert.deepEqual(rows[0], { loans: 3, copies: 3 });
    const recorded = (await audit.entries({ afterSeq: before })).filter(
      (entry) => entry.type === "loan_confirmed" && entry.data.memberId === member.member.id,
    );
    assert.equal(recorded.length, 3);
    assert.equal((await audit.verify()).intact, true);
  });
});

describe("My Loans", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let ana: TestMember;
  let ben: TestMember;

  const lend = async (member: TestMember, copy: TestCopy) => {
    const response = await h.lendAtDesk(lita, member, copy.barcode);
    assert.equal(response.status, 201);
    return ((await response.json()) as ConfirmLoanResponse).loan;
  };

  before(async () => {
    await h.start({
      // A route that asks PostgreSQL for the Loans of a Book as whoever is signed in, with no
      // check of its own. It stands in for a bug in the API: row-level security is the second layer.
      extraRoutes: (router, deps) => {
        router.get("/test/loan-rows/:bookId", async (req, res) => {
          const identity = await deps.auth.identify(req.get("authorization")?.replace("Bearer ", "") ?? "");
          if (!identity) {
            res.status(401).end();
            return;
          }
          const rows = await withIdentity(deps.db, identity, async (scope) => {
            const result = await scope.query(
              `select l.id, l.member_id from public.loans l join public.copies c on c.id = l.copy_id
                where c.book_id = $1 order by l.checked_out_at`,
              [req.params.bookId],
            );
            return result.rows;
          });
          res.json({ rows });
        });
      },
    });
    lita = await h.librarian();
    ana = await createTestMember(h.api(), { firstName: "Ana" });
    ben = await createTestMember(h.api(), { firstName: "Ben" });
  });
  after(() => h.stop());

  it("marks a Loan overdue once its due day has ended, and not before", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Due Soon");
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    await lend(member, book.copies[0] as TestCopy);
    const overdue = async () => (await h.loansOf(member)).map((loan) => loan.overdue);

    assert.deepEqual(await overdue(), [false]);
    // 19 Nov, 23:59:59.999 in Manila: the last moment of the due day.
    h.api().clock.set("2026-11-19T15:59:59.999Z");
    assert.deepEqual(await overdue(), [false]);
    h.api().clock.advance({ milliseconds: 1 });
    assert.deepEqual(await overdue(), [true]);
    h.api().clock.advance({ days: 30 });
    assert.deepEqual(await overdue(), [true]);
  });

  it("lists current Loans first, the one due soonest at the top, then past Loans, which are never overdue", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Three Loans", ["available", "available", "available"]);
    const [a, b, c] = book.copies as [TestCopy, TestCopy, TestCopy];
    h.api().clock.set("2026-11-10T02:00:00.000Z");
    const returned = await lend(member, a);
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const later = await lend(member, b);
    h.api().clock.set("2026-11-11T02:00:00.000Z");
    const sooner = await lend(member, c);
    // Returns arrive with their own ticket: arrange one here.
    await h.api().db.query("update public.loans set returned_at = $2 where id = $1", [returned.id, "2026-11-13T02:00:00.000Z"]);
    h.api().clock.set("2026-11-25T02:00:00.000Z");

    const loans = await h.loansOf(member);

    assert.deepEqual(
      loans.map((loan) => [loan.id, loan.dueAt, loan.returnedAt, loan.overdue]),
      [
        [sooner.id, "2026-11-18T15:59:59.999Z", null, true],
        [later.id, "2026-11-19T15:59:59.999Z", null, true],
        [returned.id, "2026-11-17T15:59:59.999Z", "2026-11-13T02:00:00.000Z", false],
      ],
    );
  });

  it("shows a Member only their own Loans", async () => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const book = await h.addBook("Private Shelf", ["available", "available"]);
    const anas = await lend(ana, book.copies[0] as TestCopy);
    const bens = await lend(ben, book.copies[1] as TestCopy);

    assert.deepEqual((await h.loansOf(ana)).filter((loan) => loan.bookId === book.id).map((loan) => loan.id), [anas.id]);
    assert.deepEqual((await h.loansOf(ben)).filter((loan) => loan.bookId === book.id).map((loan) => loan.id), [bens.id]);
  });

  it("lets PostgreSQL itself refuse one Member another Member's Loans, while a Librarian reads both", async () => {
    h.api().clock.set("2026-11-12T03:00:00.000Z");
    const book = await h.addBook("Row Level Security", ["available", "available"]);
    const anas = await lend(ana, book.copies[0] as TestCopy);
    h.api().clock.advance({ minutes: 2 });
    const bens = await lend(ben, book.copies[1] as TestCopy);
    const rowsAs = async (token: string) => (await (await h.send("GET", `/test/loan-rows/${book.id}`, token)).json()).rows;

    assert.deepEqual(await rowsAs(ana.accessToken), [{ id: anas.id, member_id: ana.member.id }]);
    assert.deepEqual(await rowsAs(ben.accessToken), [{ id: bens.id, member_id: ben.member.id }]);
    assert.deepEqual(await rowsAs(lita.accessToken), [
      { id: anas.id, member_id: ana.member.id },
      { id: bens.id, member_id: ben.member.id },
    ]);
  });

  it("does not let a Member or a Librarian write Loans straight to the database, or read which Digital IDs were used", async () => {
    h.api().clock.set("2026-11-12T04:00:00.000Z");
    const book = await h.addBook("Write Attempts", ["available", "available"]);
    const bens = await lend(ben, book.copies[0] as TestCopy);
    const spare = book.copies[1] as TestCopy;

    for (const identity of [
      { userId: ana.member.id, email: ana.email },
      { userId: lita.userId, email: "librarian@example.com" },
    ]) {
      const outcomes = await withIdentity(h.api().db, identity, async (scope) => {
        const attempts: string[] = [];
        for (const sql of [
          `insert into public.loans (copy_id, member_id, confirmed_by, checked_out_at, due_at)
           values ('${spare.id}', '${ana.member.id}', '${lita.userId}', now(), now() + interval '7 days')`,
          `update public.loans set returned_at = now() where id = '${bens.id}'`,
          "delete from public.loans",
          `update public.copies set status = 'available' where id = '${(book.copies[0] as TestCopy).id}'`,
          "select * from public.digital_id_uses",
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
      assert.deepEqual(outcomes, ["refused", "refused", "refused", "refused", "refused"], identity.email);
    }
  });
});
