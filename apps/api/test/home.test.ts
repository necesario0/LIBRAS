import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { HOME_SHELF_LENGTH } from "@libras/shared";
import type { CopyStatus, HomeResponse, HomeShelf } from "@libras/shared";
import { createTestAccount, createTestMember, createTestMemberOfType, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

/**
 * GET /home: the shelves. The database is shared with other tests and holds the seeded catalog, so the tests
 * stand where nothing else is: the API clock sits in 2090, so the 180-day window of Loans holds only the Loans
 * these tests insert, and the Books they add are "added" in 2099, so they head New arrivals.
 */
const NOW = "2090-06-01T08:00:00+08:00";
const DAY = 24 * 60 * 60 * 1000;
const ADDED_BASE = Date.parse("2099-01-01T00:00:00Z");

describe("GET /home", () => {
  let api: TestApi;
  let librarianId: string;
  const bookIds: string[] = [];
  const memberIds: string[] = [];
  let addedCount = 0;

  /** Adds a Book with Copies of the given statuses; each later Book is "added" a minute after the one before. */
  async function addBook(
    title: string,
    copyStatuses: CopyStatus[],
    {
      authors = [`Author, ${title}`],
      edition = null,
      year = 2020,
      call = null,
    }: { authors?: string[]; edition?: string | null; year?: number | null; call?: string | null } = {},
  ): Promise<string> {
    const added = new Date(ADDED_BASE + addedCount++ * 60_000);
    const { rows } = await api.db.query(
      "insert into public.books (title, authors, edition, publication_year, lc_call_number, created_at) values ($1, $2, $3, $4, $5, $6) returning id",
      [title, authors, edition, year, call, added],
    );
    const id: string = rows[0].id;
    bookIds.push(id);
    for (const status of copyStatuses) {
      await api.db.query("insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4)", [
        id,
        `T-${randomUUID()}`,
        `T-${randomUUID()}`,
        status,
      ]);
    }
    return id;
  }

  /** `count` returned Loans of the Book by the Member, `daysAgo` days before the API clock (Copies stay as they are). */
  async function borrow(member: TestMember, bookId: string, count = 1, daysAgo = 1): Promise<void> {
    const { rows } = await api.db.query("select id from public.copies where book_id = $1 limit 1", [bookId]);
    const checkedOut = new Date(api.clock.now().getTime() - daysAgo * DAY);
    await api.db.query(
      `insert into public.loans (copy_id, member_id, confirmed_by, checked_out_at, due_at, returned_at)
       select $1, $2, $3, $4, $5, $6 from generate_series(1, $7::int)`,
      [rows[0].id, member.member.id, librarianId, checkedOut, new Date(checkedOut.getTime() + 3 * DAY), new Date(checkedOut.getTime() + 2 * DAY), count],
    );
  }

  const student = async (college: string): Promise<TestMember> => {
    const made = await createTestMember(api, { details: { studentNumber: `K${randomInt(10_000_000, 99_999_999)}`, college: college as "CCIS" } });
    memberIds.push(made.member.id);
    return made;
  };
  const ofType = async (type: "visitor" | "alumni" | "faculty"): Promise<TestMember> => {
    const made = await createTestMemberOfType(api, type);
    memberIds.push(made.member.id);
    return made;
  };

  async function home(member: TestMember): Promise<HomeResponse> {
    const response = await fetch(`${api.baseUrl}/home`, { headers: { authorization: `Bearer ${member.accessToken}` } });
    assert.equal(response.status, 200);
    return (await response.json()) as HomeResponse;
  }
  async function shelf(member: TestMember, kind: HomeShelf["kind"]): Promise<HomeShelf | undefined> {
    return (await home(member)).shelves.find((candidate) => candidate.kind === kind);
  }

  before(async () => {
    api = await startTestApi();
    api.clock.set(NOW);
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Home Test" } });
    librarianId = librarian.userId;
  });

  after(async () => {
    await api.db.query("delete from public.loans where copy_id in (select id from public.copies where book_id = any($1))", [bookIds]);
    await api.db.query("delete from public.copies where book_id = any($1)", [bookIds]);
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  it("needs a signed-in Member", async () => {
    assert.equal((await fetch(`${api.baseUrl}/home`)).status, 401);
    const account = await createTestAccount(api);
    const token = await signInDirect(account.email, account.password);
    const staff = await fetch(`${api.baseUrl}/home`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(staff.status, 403);
  });

  describe("New arrivals", () => {
    it("lists the Books added most recently, newest first, with their Copy counts", async () => {
      const member = await student("CCIS");
      const first = await addBook(`Arrival ${randomUUID()}`, ["available", "on_loan"]);
      const second = await addBook(`Arrival ${randomUUID()}`, ["available"]);
      const third = await addBook(`Arrival ${randomUUID()}`, []);
      const found = await shelf(member, "new_arrivals");
      assert.deepEqual(found?.books.slice(0, 3).map((book) => book.id), [third, second, first]);
      assert.equal(found?.title, "New arrivals");
      assert.equal(found?.books[2]?.totalCopies, 2);
      assert.equal(found?.books[2]?.availableCopies, 1);
      assert.equal(found?.books[0]?.totalCopies, 0);
    });

    it("folds editions of one work into the newest edition, at the place of the edition added last", async () => {
      const member = await student("CCIS");
      const author = [`Folded, ${randomUUID()}`];
      const newer = await addBook("Folding Atlas, 3rd ed.", ["available"], { authors: author, edition: "3rd ed.", year: 2019 });
      const other = await addBook(`Other ${randomUUID()}`, ["available"]);
      const older = await addBook("Folding Atlas, 2nd ed.", ["available"], { authors: author, edition: "2nd ed.", year: 2012 });
      const found = await shelf(member, "new_arrivals");
      // The work sits where its most recently added edition is (the 2nd, added last) and shows the newest edition (the 3rd).
      assert.deepEqual(found?.books.slice(0, 2).map((book) => book.id), [newer, other]);
      assert.ok(!found?.books.some((book) => book.id === older));
    });

    it("holds at most the shelf length", async () => {
      const member = await student("CCIS");
      for (let i = 0; i < HOME_SHELF_LENGTH + 2; i++) await addBook(`Many ${randomUUID()}`, ["available"]);
      assert.equal((await shelf(member, "new_arrivals"))?.books.length, HOME_SHELF_LENGTH);
    });
  });

  describe("Popular in your college", () => {
    it("lists the Books most borrowed in the window by Members of the same college, folded by edition", async () => {
      const ccis = await student("CCIS");
      const ccisToo = await student("CCIS");
      const cet = await student("CET");
      const author = [`Popular, ${randomUUID()}`];
      const first = await addBook(`Popular first ${randomUUID()}`, ["available"]);
      const second = await addBook(`Popular second ${randomUUID()}`, ["available"]);
      const cetFavourite = await addBook(`Popular CET ${randomUUID()}`, ["available"]);
      const tooOld = await addBook(`Popular old ${randomUUID()}`, ["available"]);
      const newer = await addBook("Popular Folds, 2nd ed.", ["available"], { authors: author, edition: "2nd ed.", year: 2018 });
      const older = await addBook("Popular Folds, 1st ed.", ["available"], { authors: author, edition: "1st ed.", year: 2010 });
      await borrow(ccis, first, 2);
      await borrow(ccisToo, first, 2);
      await borrow(ccis, second, 2);
      await borrow(cet, cetFavourite, 9);
      await borrow(ccis, tooOld, 9, 181);
      await borrow(ccis, older, 2);
      await borrow(ccisToo, newer, 1);
      const found = await shelf(ccis, "popular");
      assert.equal(found?.title, "Popular in CCIS");
      // first: 4 Loans; then the work "Popular Folds" (3 in all), which shows its newer edition; then second: 2 Loans.
      assert.deepEqual(found?.books.map((book) => book.id).slice(0, 3), [first, newer, second]);
      assert.ok(!found?.books.some((book) => [cetFavourite, tooOld, older].includes(book.id)));
    });

    it("counts a Faculty Member's college the same way", async () => {
      const faculty = await ofType("faculty");
      const college = faculty.member.accountType === "faculty" ? faculty.member.details.college : null;
      assert.ok(college);
      const book = await addBook(`Faculty pick ${randomUUID()}`, ["available"]);
      await borrow(faculty, book, 50);
      const found = await shelf(faculty, "popular");
      assert.equal(found?.title, `Popular in ${college}`);
      assert.equal(found?.books[0]?.id, book);
    });

    it("is left out when no Member of the college borrowed in the window", async () => {
      const lonely = await student("IOPsy");
      assert.equal(await shelf(lonely, "popular"), undefined);
    });

    it("gives a Member with no college the library-wide shelf: Loans by every Member count", async () => {
      const visitor = await ofType("visitor");
      const alumnus = await ofType("alumni");
      const ccis = await student("CCIS");
      const cet = await student("CET");
      const most = await addBook(`Library favourite ${randomUUID()}`, ["available"]);
      const less = await addBook(`Library second ${randomUUID()}`, ["available"]);
      await borrow(ccis, most, 100);
      await borrow(cet, most, 100);
      await borrow(cet, less, 150);
      for (const member of [visitor, alumnus]) {
        const found = await shelf(member, "popular");
        assert.equal(found?.title, "Popular in the library");
        assert.deepEqual(found?.books.slice(0, 2).map((book) => book.id), [most, less]);
      }
    });
  });

  describe("Available now in your top Subject", () => {
    it("lists Books with an available Copy in the Subject the Member borrowed most", async () => {
      const member = await student("CCIS");
      const law1 = await addBook(`Law one ${randomUUID()}`, ["available"], { call: "K 487 .A1" });
      const law2 = await addBook(`Law two ${randomUUID()}`, ["available", "on_loan"], { call: "KF 801" });
      const lawOut = await addBook(`Law out ${randomUUID()}`, ["on_loan"], { call: "K 400" });
      const mathBook = await addBook(`Math ${randomUUID()}`, ["available"], { call: "QA 37 .B1" });
      const cs = await addBook(`CS ${randomUUID()}`, ["available"], { call: "QA 76.73 .J38" });
      await borrow(member, law1, 1, 400);
      await borrow(member, lawOut, 1, 400);
      await borrow(member, cs, 1, 400);
      // Library-wide Loans in the window decide the order.
      const other = await student("CET");
      await borrow(other, law2, 2);
      await borrow(other, law1, 1);
      const found = await shelf(member, "available_now");
      assert.equal(found?.title, "Available now in Law");
      assert.deepEqual(found?.books.slice(0, 2).map((book) => book.id), [law2, law1]);
      assert.ok(!found?.books.some((book) => [lawOut, mathBook, cs].includes(book.id)));
      assert.ok(found?.books.every((book) => book.subject === "Law" && book.availableCopies > 0));
    });

    it("looks at the newest edition when it folds editions", async () => {
      const member = await student("CCIS");
      const author = [`Edition, ${randomUUID()}`];
      const gone = await addBook("Statutes, 5th ed.", ["on_loan"], { authors: author, edition: "5th ed.", year: 2022, call: "KF 900" });
      const there = await addBook("Statutes, 4th ed.", ["available"], { authors: author, edition: "4th ed.", year: 2018, call: "KF 900" });
      await borrow(member, there, 3, 400);
      const found = await shelf(member, "available_now");
      assert.equal(found?.title, "Available now in Law");
      assert.ok(!found?.books.some((book) => book.id === gone || book.id === there));
    });

    it("is left out when the top Subject has nothing on the shelf", async () => {
      const member = await student("CCIS");
      const out = await addBook(`Pharmacy out ${randomUUID()}`, ["on_loan"], { call: "RS 91 .X" });
      await borrow(member, out, 1, 400);
      assert.equal(await shelf(member, "available_now"), undefined);
    });

    it("gives a Member with no Loans On the shelf now across the library", async () => {
      const member = await student("CCIS");
      const book = await addBook(`Shelf now ${randomUUID()}`, ["available"]);
      await addBook(`Shelf not ${randomUUID()}`, ["on_loan"]);
      const taken = await student("CET");
      await borrow(taken, book, 300);
      const found = await shelf(member, "available_now");
      assert.equal(found?.title, "On the shelf now");
      assert.equal(found?.subtitle, "You can borrow these today");
      assert.equal(found?.books[0]?.id, book);
      assert.ok(found?.books.every((candidate) => candidate.availableCopies > 0));
    });

    it("gives a Member who cannot borrow On the shelf now, even with a Loan on record", async () => {
      const visitor = await ofType("visitor");
      const book = await addBook(`Visitor shelf ${randomUUID()}`, ["available"], { call: "K 487" });
      await borrow(visitor, book, 1, 400);
      const found = await shelf(visitor, "available_now");
      assert.equal(found?.title, "On the shelf now");
      assert.equal(found?.subtitle, "You can read these in the library today");
    });
  });

  it("leaves a shelf out when it has no Books, and keeps the order of the shelves", async () => {
    const lonely = await student("IOPsy");
    const kinds = (await home(lonely)).shelves.map((candidate) => candidate.kind);
    assert.deepEqual(kinds, ["new_arrivals", "available_now"]);
  });
});
