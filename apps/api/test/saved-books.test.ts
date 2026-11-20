import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { BookDetailResponse, CopyStatus, MySavedBooksResponse, SaveBookResponse } from "@libras/shared";
import { ACCOUNT_TYPES } from "@libras/shared";
import { withIdentity } from "../src/auth/index.ts";
import { createTestMember, createTestMemberOfType, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

describe("Saved books", () => {
  let api: TestApi;
  let ana: TestMember;
  let ben: TestMember;
  const bookIds: string[] = [];

  async function addBook(title: string, copyStatuses: CopyStatus[] = []): Promise<string> {
    const { rows } = await api.db.query("insert into public.books (title, authors) values ($1, $2) returning id", [`${title} ${randomUUID()}`, ["Cruz, Ana"]]);
    const id: string = rows[0].id;
    bookIds.push(id);
    for (const status of copyStatuses) {
      await api.db.query("insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4)", [id, `T-${randomUUID()}`, `T-${randomUUID()}`, status]);
    }
    return id;
  }

  const call = (method: string, path: string, token: string | null) =>
    fetch(`${api.baseUrl}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const save = (bookId: string, member: TestMember | null = ana) => call("PUT", `/members/me/saved-books/${bookId}`, member?.accessToken ?? null);
  const remove = (bookId: string, member: TestMember | null = ana) => call("DELETE", `/members/me/saved-books/${bookId}`, member?.accessToken ?? null);
  async function list(member: TestMember = ana): Promise<MySavedBooksResponse["savedBooks"]> {
    const response = await call("GET", "/members/me/saved-books", member.accessToken);
    assert.equal(response.status, 200);
    return ((await response.json()) as MySavedBooksResponse).savedBooks;
  }
  async function detail(bookId: string, member: TestMember = ana): Promise<BookDetailResponse> {
    const response = await call("GET", `/catalog/books/${bookId}`, member.accessToken);
    assert.equal(response.status, 200);
    return (await response.json()) as BookDetailResponse;
  }

  before(async () => {
    api = await startTestApi();
    ana = await createTestMember(api, { firstName: "Ana" });
    ben = await createTestMember(api, { firstName: "Ben" });
  });
  after(async () => {
    try {
      await api.db.query("delete from public.copies where book_id = any($1)", [bookIds]);
      await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    } finally {
      await api.close();
    }
  });

  it("saves a Book, lists it with its availability, and removes it", async () => {
    const id = await addBook("Saved and listed", ["available", "on_loan", "set_aside"]);
    api.clock.set("2026-11-20T08:00:00.000Z");
    const saved = await save(id);
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()) as SaveBookResponse, { saved: true });

    const [entry] = await list();
    assert.ok(entry);
    assert.equal(entry.bookId, id);
    assert.deepEqual(entry.authors, ["Cruz, Ana"]);
    assert.equal(entry.availableCopies, 1);
    assert.equal(entry.totalCopies, 3);
    assert.equal(entry.savedAt, "2026-11-20T08:00:00.000Z");

    const removed = await remove(id);
    assert.equal(removed.status, 200);
    assert.deepEqual((await removed.json()) as SaveBookResponse, { saved: false });
    assert.deepEqual(await list(), []);
  });

  it("lists the newest Saved book first", async () => {
    const [a, b, c] = [await addBook("First"), await addBook("Second"), await addBook("Third")] as [string, string, string];
    api.clock.set("2026-11-20T09:00:00.000Z");
    await save(a);
    api.clock.advance({ minutes: 1 });
    await save(c);
    api.clock.advance({ minutes: 1 });
    await save(b);
    assert.deepEqual((await list()).map((entry) => entry.bookId), [b, c, a]);
    for (const id of [a, b, c]) await remove(id);
  });

  it("is safe to repeat: saving twice keeps one entry and its time, removing twice succeeds", async () => {
    const id = await addBook("Repeated");
    api.clock.set("2026-11-20T10:00:00.000Z");
    assert.equal((await save(id)).status, 200);
    api.clock.advance({ hours: 1 });
    assert.equal((await save(id)).status, 200);
    const entries = (await list()).filter((entry) => entry.bookId === id);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.savedAt, "2026-11-20T10:00:00.000Z");
    assert.equal((await remove(id)).status, 200);
    assert.equal((await remove(id)).status, 200);
    assert.deepEqual((await list()).filter((entry) => entry.bookId === id), []);
  });

  it("tells the Book detail whether the Member has saved the Book", async () => {
    const id = await addBook("Detail flag");
    assert.equal((await detail(id)).saved, false);
    await save(id);
    assert.equal((await detail(id)).saved, true);
    assert.equal((await detail(id, ben)).saved, false);
    await remove(id);
    assert.equal((await detail(id)).saved, false);
  });

  it("refuses a missing Book, a bad id and a request with no session", async () => {
    const missing = await save(randomUUID());
    assert.equal(missing.status, 404);
    assert.equal(((await missing.json()) as { error: { code: string } }).error.code, "book_not_found");
    assert.equal((await save("not-a-uuid")).status, 400);
    assert.equal((await remove("not-a-uuid")).status, 400);
    assert.equal((await save(randomUUID(), null)).status, 401);
    assert.equal((await call("GET", "/members/me/saved-books", null)).status, 401);
  });

  for (const accountType of ACCOUNT_TYPES) {
    it(`lets a ${accountType} Member save and see Saved books`, async () => {
      const member = await createTestMemberOfType(api, accountType);
      const id = await addBook(`Saved by ${accountType}`, ["available"]);
      assert.equal((await save(id, member)).status, 200);
      assert.deepEqual((await list(member)).map((entry) => entry.bookId), [id]);
    });
  }

  it("does not write Saved books to the audit log", async () => {
    const id = await addBook("Not audited");
    const count = async () => Number((await api.db.query("select count(*) from public.audit_log")).rows[0].count);
    const before = await count();
    await save(id);
    await remove(id);
    assert.equal(await count(), before);
  });

  it("removes a Saved book with its Book", async () => {
    const id = await addBook("Short lived");
    await save(id);
    await api.db.query("delete from public.books where id = $1", [id]);
    assert.deepEqual(await list(), []);
    const { rows } = await api.db.query("select 1 from public.saved_books where book_id = $1", [id]);
    assert.equal(rows.length, 0);
  });

  describe("another Member's Saved books", () => {
    it("are neither listed, reported as saved nor removable through the API", async () => {
      const id = await addBook("Private to Ana");
      await save(id);
      assert.deepEqual((await list(ben)).filter((entry) => entry.bookId === id), []);
      assert.equal((await detail(id, ben)).saved, false);
      assert.equal((await remove(id, ben)).status, 200);
      assert.equal((await detail(id)).saved, true);
      await remove(id);
    });

    it("are unreadable and unchangeable at the database, even with no check in the API", async () => {
      const id = await addBook("Private in the database");
      await save(id);
      const asBen = { userId: ben.member.id, email: ben.email };

      const seen = await withIdentity(api.db, asBen, async (scope) => (await scope.query("select 1 from public.saved_books where book_id = $1", [id])).rows);
      assert.equal(seen.length, 0);

      await assert.rejects(
        withIdentity(api.db, asBen, (scope) => scope.query("insert into public.saved_books (member_id, book_id, saved_at) values ($1, $2, now())", [ana.member.id, id])),
        /row-level security/,
      );
      const deleted = await withIdentity(api.db, asBen, (scope) => scope.query("delete from public.saved_books where member_id = $1", [ana.member.id]));
      assert.equal(deleted.rowCount, 0);
      await assert.rejects(withIdentity(api.db, asBen, (scope) => scope.query("update public.saved_books set saved_at = now()")), /permission denied/);

      assert.equal((await detail(id)).saved, true);
      await remove(id);
    });
  });
});
