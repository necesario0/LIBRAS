import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { RETURN_MESSAGES } from "@libras/shared";
import type { BookDetailResponse, CatalogSearchResponse, ConfirmLoanResponse, RecordReturnResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { CopyStatus, TestCopy, TestLibrarian } from "./loans-harness.ts";

describe("Recording a return at the desk", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let ana: TestMember;

  /** The Librarian scans the Member's Digital ID, then the Copy: the Loan the return will close. */
  const lend = async (member: TestMember, copy: string): Promise<ConfirmLoanResponse> => {
    const response = await h.send("POST", "/desk/loans", lita.accessToken, { digitalId: await h.digitalIdOf(member), copy });
    assert.equal(response.status, 201);
    return (await response.json()) as ConfirmLoanResponse;
  };
  /** The Librarian scans the Copy's barcode (or types its accession number) with no Member at the desk. */
  const giveBack = (copy: string, librarian = lita) => h.send("POST", "/desk/returns", librarian.accessToken, { copy });
  const statusOf = async (copyId: string): Promise<CopyStatus> =>
    (await h.api().db.query("select status from public.copies where id = $1", [copyId])).rows[0].status;

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

  it("closes the Loan and frees the Copy, and the Member then sees the Loan among their past Loans with its return date", async () => {
    const book = await h.addBook("Coming Back");
    const copy = book.copies[0] as TestCopy;
    const lent = await lend(ana, copy.barcode);
    assert.equal(await statusOf(copy.id), "on_loan");

    h.api().clock.set("2026-11-15T07:30:00.000Z");
    const response = await giveBack(copy.barcode);

    assert.equal(response.status, 200);
    const { loan } = (await response.json()) as RecordReturnResponse;
    assert.deepEqual(loan, {
      id: lent.loan.id,
      bookTitle: "Coming Back",
      accessionNumber: copy.accessionNumber,
      memberName: "Ana Santos",
      checkedOutAt: "2026-11-12T02:00:00.000Z",
      dueAt: "2026-11-19T15:59:59.999Z",
      returnedAt: "2026-11-15T07:30:00.000Z",
      late: false,
      heldFor: null,
    });
    assert.equal(await statusOf(copy.id), "available");
    const { loans } = await h.myLoans(ana);
    const mine = loans.find((candidate) => candidate.id === lent.loan.id);
    assert.equal(mine?.returnedAt, "2026-11-15T07:30:00.000Z");
    assert.equal(mine?.overdue, false);
  });

  it("accepts the accession number typed by hand, in either case", async () => {
    const book = await h.addBook("Typed Back", ["available", "available"]);
    const [first, second] = book.copies as [TestCopy, TestCopy];
    await lend(ana, first.barcode);
    await lend(ana, second.barcode);

    assert.equal((await giveBack(first.accessionNumber)).status, 200);
    assert.equal((await giveBack(second.accessionNumber.toLowerCase())).status, 200);

    assert.deepEqual([await statusOf(first.id), await statusOf(second.id)], ["available", "available"]);
  });

  it("makes the count of available Copies rise again, on the Book page, in search and for the Hold action", async () => {
    const member = await createTestMember(h.api());
    const word = `zq${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const book = await h.addBook(`The ${word} Return`, ["available"]);
    const copy = book.copies[0] as TestCopy;
    const available = async () =>
      ((await (await h.send("GET", `/catalog/books/${book.id}`, ana.accessToken)).json()) as BookDetailResponse).book.availableCopies;
    const found = async () =>
      ((await (await h.send("GET", `/catalog/search?q=${word}`, ana.accessToken)).json()) as CatalogSearchResponse).results[0];
    await lend(member, copy.barcode);
    assert.equal(await available(), 0);
    assert.equal((await eventually(found, (result) => result !== undefined))?.availableCopies, 0);

    assert.equal((await giveBack(copy.barcode)).status, 200);

    assert.equal(await available(), 1);
    assert.equal((await found())?.availableCopies, 1);
    // A Hold is only for a Book with no available Copy, and this one has one again.
    assert.equal((await refusal(await h.send("POST", "/holds", ana.accessToken, { bookId: book.id }))).code, "copy_available");
  });

  it("frees the Member's loan limit, so they can borrow again", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Limit Reset", ["available", "available", "available", "available"]);
    const [one, two, three, four] = book.copies as [TestCopy, TestCopy, TestCopy, TestCopy];
    for (const copy of [one, two, three]) await lend(member, copy.barcode);
    const refused = await h.send("POST", "/desk/loans", lita.accessToken, { digitalId: await h.digitalIdOf(member), copy: four.barcode });
    assert.equal((await refusal(refused)).code, "loan_limit_reached");

    assert.equal((await giveBack(two.barcode)).status, 200);

    await lend(member, four.barcode);
    const { loans } = await h.myLoans(member);
    assert.equal(loans.filter((loan) => loan.returnedAt === null).length, 3);
    assert.equal(loans.filter((loan) => loan.returnedAt !== null).length, 1);
  });

  it("lets the same Copy be lent again after its return, and keeps each Loan in the history", async () => {
    const ben = await createTestMember(h.api());
    const book = await h.addBook("Round And Round");
    const copy = book.copies[0] as TestCopy;
    await lend(ana, copy.barcode);
    assert.equal((await giveBack(copy.barcode)).status, 200);

    await lend(ben, copy.barcode);
    assert.equal((await giveBack(copy.barcode)).status, 200);

    const { rows } = await h
      .api()
      .db.query("select count(*)::int as loans, count(returned_at)::int as returned from public.loans where copy_id = $1", [copy.id]);
    assert.deepEqual(rows[0], { loans: 2, returned: 2 });
  });

  it("says when a Copy came back after its due day, and still takes it back", async () => {
    const book = await h.addBook("Overdue Book");
    const copy = book.copies[0] as TestCopy;
    await lend(ana, copy.barcode);

    // Due on 19 Nov (the end of the day in Manila); the Copy comes back on 21 Nov.
    h.api().clock.set("2026-11-21T02:00:00.000Z");
    const response = await giveBack(copy.barcode);

    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as RecordReturnResponse).loan.late, true);
    const mine = (await h.loansOf(ana)).find((loan) => loan.accessionNumber === copy.accessionNumber);
    assert.equal(mine?.returnedAt, "2026-11-21T02:00:00.000Z");
    assert.equal(mine?.overdue, false);
  });

  it("gives a clear message for a Copy that is not on Loan: on the shelf, set aside, or already returned", async () => {
    const book = await h.addBook("Not Out", ["available", "set_aside", "available"]);
    const [onTheShelf, setAside, returned] = book.copies as [TestCopy, TestCopy, TestCopy];
    await lend(ana, returned.barcode);
    assert.equal((await giveBack(returned.barcode)).status, 200);
    const expected = { status: 409, code: "copy_not_on_loan", message: RETURN_MESSAGES.copyNotOnLoan };

    assert.deepEqual(await refusal(await giveBack(onTheShelf.barcode)), expected);
    assert.deepEqual(await refusal(await giveBack(setAside.accessionNumber)), expected);
    assert.deepEqual(await refusal(await giveBack(returned.barcode)), expected);

    assert.deepEqual(
      [await statusOf(onTheShelf.id), await statusOf(setAside.id), await statusOf(returned.id)],
      ["available", "set_aside", "available"],
    );
  });

  it("gives clear feedback for a barcode that belongs to no Copy, and refuses a request that is not a Copy code", async () => {
    assert.deepEqual(await refusal(await giveBack("3999999997")), {
      status: 404,
      code: "copy_not_found",
      message: RETURN_MESSAGES.copyNotFound,
    });
    for (const body of [{}, { copy: "" }, { copy: "39<script>" }, { copy: 12345 }, { copy: "3911111111", extra: true }, { copy: "x".repeat(65) }]) {
      const response = await h.send("POST", "/desk/returns", lita.accessToken, body);
      assert.deepEqual(await refusal(response), { status: 400, code: "invalid_request", message: RETURN_MESSAGES.invalidRequest });
    }
  });

  it("lets only a Librarian record a return: a Member cannot, not even of their own Copy", async () => {
    const book = await h.addBook("Mine To Keep");
    const copy = book.copies[0] as TestCopy;
    await lend(ana, copy.barcode);

    const asMember = await h.send("POST", "/desk/returns", ana.accessToken, { copy: copy.barcode });
    const signedOut = await h.send("POST", "/desk/returns", null, { copy: copy.barcode });

    assert.deepEqual([asMember.status, (await asMember.json()).error.code], [403, "not_staff"]);
    assert.equal(signedOut.status, 401);
    assert.equal(await statusOf(copy.id), "on_loan");
  });

  it("records each return in the audit log, and nothing for a refused one", async () => {
    const audit = createAuditLog(h.api());
    const member = await createTestMember(h.api());
    const book = await h.addBook("For The Record");
    const copy = book.copies[0] as TestCopy;
    const lent = await lend(member, copy.barcode);
    const before = (await audit.newest())?.seq ?? 0;

    h.api().clock.set("2026-11-13T04:15:00.000Z");
    assert.equal((await giveBack(copy.barcode)).status, 200);
    assert.equal((await giveBack(copy.barcode)).status, 409);
    assert.equal((await giveBack("3999999997")).status, 404);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "copy_returned");
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry?.actorId, lita.userId);
    assert.equal(entry?.subject, lent.loan.id);
    assert.equal(entry?.occurredAt.toISOString(), "2026-11-13T04:15:00.000Z");
    assert.deepEqual(entry?.data, {
      memberId: member.member.id,
      copyId: copy.id,
      bookId: book.id,
      accessionNumber: copy.accessionNumber,
      returnedAt: "2026-11-13T04:15:00.000Z",
      late: false,
    });
    assert.equal((await audit.verify()).intact, true);
  });
});

describe("Recording returns at the same moment", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let omar: TestLibrarian;

  const lend = async (member: TestMember, copy: string): Promise<number> =>
    (await h.send("POST", "/desk/loans", lita.accessToken, { digitalId: await h.digitalIdOf(member), copy })).status;
  const giveBack = (librarian: TestLibrarian, copy: string) => h.send("POST", "/desk/returns", librarian.accessToken, { copy });
  const loanCounts = async (copyId: string) =>
    (
      await h
        .api()
        .db.query("select count(*)::int as loans, count(returned_at)::int as returned from public.loans where copy_id = $1", [copyId])
    ).rows[0];

  before(async () => {
    await h.start();
    lita = await h.librarian();
    omar = await h.librarian("Omar Cruz");
  });
  after(() => h.stop());

  it("records exactly one return and one audit entry when two Librarians scan the same Copy at once", async () => {
    const audit = createAuditLog(h.api());
    for (let round = 0; round < 8; round += 1) {
      const member = await createTestMember(h.api());
      const book = await h.addBook(`Race To Return ${round}`);
      const copy = book.copies[0] as TestCopy;
      assert.equal(await lend(member, copy.barcode), 201);
      const before = (await audit.newest())?.seq ?? 0;

      const responses = await Promise.all([giveBack(lita, copy.barcode), giveBack(omar, copy.accessionNumber)]);

      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      const refused = responses.find((response) => response.status === 409) as Response;
      assert.equal((await refusal(refused)).code, "copy_not_on_loan");
      assert.deepEqual(await loanCounts(copy.id), { loans: 1, returned: 1 });
      const entries = (await audit.entries({ afterSeq: before })).filter(
        (entry) => entry.type === "copy_returned" && entry.data.copyId === copy.id,
      );
      assert.equal(entries.length, 1);
    }
    assert.equal((await audit.verify()).intact, true);
  });

  it("records one return however many times the same Copy is scanned at once", async () => {
    const audit = createAuditLog(h.api());
    const member = await createTestMember(h.api());
    const book = await h.addBook("Burst Return");
    const copy = book.copies[0] as TestCopy;
    assert.equal(await lend(member, copy.barcode), 201);
    const before = (await audit.newest())?.seq ?? 0;

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => giveBack(i % 2 === 0 ? lita : omar, i % 3 === 0 ? copy.accessionNumber : copy.barcode)),
    );

    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 9);
    assert.deepEqual(await loanCounts(copy.id), { loans: 1, returned: 1 });
    const { rows } = await h.api().db.query("select status from public.copies where id = $1", [copy.id]);
    assert.equal(rows[0].status, "available");
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "copy_returned");
    assert.equal(entries.length, 1);
  });

  it("neither deadlocks nor loses a Loan when returns and Loans for the same Members and Copies run all at once", async () => {
    const audit = createAuditLog(h.api());
    const members = await Promise.all([createTestMember(h.api()), createTestMember(h.api())]);
    const book = await h.addBook("Churn", Array<CopyStatus>(6).fill("available"));
    const copies = book.copies;
    const codes = await Promise.all(members.map((member) => h.digitalIdOf(member)));
    // Each Member has two Copies out; the other two are on the shelf.
    for (const [i, member] of members.entries()) {
      for (const copy of copies.slice(i * 2, i * 2 + 2)) assert.equal(await lend(member, copy.barcode), 201);
    }
    const before = (await audit.newest())?.seq ?? 0;

    // Returns of the four Copies that are out, and Loans of every Copy for either Member, all at once.
    const requests = [
      ...copies.slice(0, 4).map((copy) => giveBack(lita, copy.barcode)),
      ...copies.map((copy, i) => h.send("POST", "/desk/loans", omar.accessToken, { digitalId: codes[i % 2], copy: copy.accessionNumber })),
      ...copies.slice(0, 4).map((copy) => giveBack(omar, copy.accessionNumber)),
    ];
    const responses = await Promise.all(requests);

    // Whatever the order, nothing failed except as a refusal, and the books balance.
    for (const response of responses) assert.ok([200, 201, 409].includes(response.status), `unexpected ${response.status}`);
    const { rows } = await h.api().db.query(
      `select count(*) filter (where returned_at is null)::int as open,
              count(distinct copy_id) filter (where returned_at is null)::int as open_copies
         from public.loans where copy_id = any($1)`,
      [copies.map((copy) => copy.id)],
    );
    assert.equal(rows[0].open, rows[0].open_copies);
    const onLoan = await h.api().db.query("select count(*)::int as count from public.copies where book_id = $1 and status = 'on_loan'", [book.id]);
    assert.equal(onLoan.rows[0].count, rows[0].open);
    const returned = await h.api().db.query(
      "select count(*)::int as count from public.loans where copy_id = any($1) and returned_at is not null",
      [copies.map((copy) => copy.id)],
    );
    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "copy_returned");
    assert.equal(entries.length, returned.rows[0].count);
    assert.equal((await audit.verify()).intact, true);
  });
});
