import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { BookDetailResponse, CopyStatus, MemberMeResponse } from "@libras/shared";
import { createTestAccount, createTestMember, createTestMemberOfType, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

describe("GET /catalog/books/:id", () => {
  let api: TestApi;
  let student: TestMember;
  const bookIds: string[] = [];

  async function addBook(
    fields: { title: string; authors?: string[]; edition?: string; year?: number; isbn?: string; callNumber?: string },
    copyStatuses: CopyStatus[],
  ): Promise<string> {
    const { rows } = await api.db.query(
      `insert into public.books (title, authors, edition, publication_year, isbn, lc_call_number)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [fields.title, fields.authors ?? [], fields.edition ?? null, fields.year ?? null, fields.isbn ?? null, fields.callNumber ?? null],
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

  const getBook = (id: string, token: string | null = student.accessToken) =>
    fetch(`${api.baseUrl}/catalog/books/${id}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  before(async () => {
    api = await startTestApi();
    student = await createTestMember(api);
  });
  after(async () => {
    await api.db.query("delete from public.copies where book_id = any($1)", [bookIds]);
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  it("shows the Book's details", async () => {
    const id = await addBook(
      {
        title: "To Kill a Mockingbird",
        authors: ["Lee, Harper"],
        edition: "50th anniversary edition",
        year: 1960,
        isbn: "9780061120084",
        callNumber: "PS3562.E353 T6 1960",
      },
      ["available"],
    );
    const response = await getBook(id);
    assert.equal(response.status, 200);
    const { book } = (await response.json()) as BookDetailResponse;
    assert.deepEqual(book, {
      id,
      title: "To Kill a Mockingbird",
      authors: ["Lee, Harper"],
      edition: "50th anniversary edition",
      publicationYear: 1960,
      isbn: "9780061120084",
      lcCallNumber: "PS3562.E353 T6 1960",
      availableCopies: 1,
      totalCopies: 1,
    });
  });

  it("says how many Copies exist and how many are available, counting each status", async () => {
    const id = await addBook({ title: "Counting Copies" }, ["available", "available", "on_loan", "set_aside", "on_loan"]);
    const { book } = (await (await getBook(id)).json()) as BookDetailResponse;
    assert.equal(book.totalCopies, 5);
    assert.equal(book.availableCopies, 2);
  });

  it("follows a Copy changing status at once", async () => {
    const id = await addBook({ title: "Going Out" }, ["available"]);
    await api.db.query("update public.copies set status = 'on_loan' where book_id = $1", [id]);
    const { book } = (await (await getBook(id)).json()) as BookDetailResponse;
    assert.equal(book.availableCopies, 0);
    assert.equal(book.totalCopies, 1);
  });

  it("reports a Book with no Copies and no optional details", async () => {
    const id = await addBook({ title: "Bare Record" }, []);
    const { book } = (await (await getBook(id)).json()) as BookDetailResponse;
    assert.deepEqual(book, {
      id,
      title: "Bare Record",
      authors: [],
      edition: null,
      publicationYear: null,
      isbn: null,
      lcCallNumber: null,
      availableCopies: 0,
      totalCopies: 0,
    });
  });

  it("answers 404 with a safe message for a Book that does not exist", async () => {
    const response = await getBook(randomUUID());
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.code, "book_not_found");
    assert.equal(typeof body.error.message, "string");
    assert.equal(body.book, undefined);
  });

  it("answers 400, not a database error, for an id that is not a Book id", async () => {
    for (const id of ["not-a-uuid", "123", "%27%20or%201=1--", "00000000-0000-0000-0000-00000000000g"]) {
      const response = await getBook(id);
      assert.equal(response.status, 400, id);
      assert.equal((await response.json()).error.code, "invalid_request", id);
    }
  });

  describe("who may open a Book", () => {
    it("refuses a request that is not signed in", async () => {
      const id = await addBook({ title: "Members Only" }, ["available"]);
      const response = await getBook(id, null);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "not_signed_in");
    });

    it("refuses an account that is not a Member", async () => {
      const id = await addBook({ title: "Staff Cannot Browse Here" }, ["available"]);
      const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lib Rarian" } });
      const response = await getBook(id, (await signInDirect(librarian.email, librarian.password)) ?? null);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "not_member");
    });

    for (const accountType of ["visitor", "alumni"] as const) {
      it(`lets a ${accountType} Member view the Book and its availability`, async () => {
        const id = await addBook({ title: `Open To ${accountType}` }, ["available", "on_loan"]);
        const member = await createTestMemberOfType(api, accountType);
        const response = await getBook(id, member.accessToken);
        assert.equal(response.status, 200);
        const { book } = (await response.json()) as BookDetailResponse;
        assert.equal(book.availableCopies, 1);
        assert.equal(book.totalCopies, 2);
      });

      it(`tells the app a ${accountType} Member is a ${accountType}, so it can say they cannot borrow`, async () => {
        const member = await createTestMemberOfType(api, accountType);
        const response = await fetch(`${api.baseUrl}/members/me`, { headers: { authorization: `Bearer ${member.accessToken}` } });
        assert.equal(response.status, 200);
        const { member: profile } = (await response.json()) as MemberMeResponse;
        assert.equal(profile.accountType, accountType);
        assert.equal(profile.id, member.member.id);
      });
    }
  });
});
