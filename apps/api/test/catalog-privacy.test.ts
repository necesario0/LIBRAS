import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { withIdentity } from "../src/auth/index.ts";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

// Row-level security is the second layer behind the API: whatever the API does,
// a signed-in person's own database role may read the catalog and never write it.
describe("the catalog under row-level security", () => {
  let api: TestApi;
  let member: TestMember;
  let bookId: string;

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
    const { rows } = await api.db.query("insert into public.books (title, authors) values ($1, '{}') returning id", [`RLS probe ${randomUUID()}`]);
    bookId = rows[0].id;
  });
  after(async () => {
    await api.db.query("delete from public.books where id = $1", [bookId]);
    await api.close();
  });

  const identity = () => ({ userId: member.member.id, email: member.email });

  it("lets a signed-in Member read Books and Copies", async () => {
    const rows = await withIdentity(api.db, identity(), async (scope) => (await scope.query("select id from public.books where id = $1", [bookId])).rows);
    assert.equal(rows.length, 1);
  });

  it("refuses a Member any write to Books and Copies", async () => {
    for (const statement of [
      "insert into public.books (title, authors) values ('Forged', '{}')",
      "update public.books set title = 'Changed'",
      "delete from public.books",
      "insert into public.copies (book_id, accession_number, barcode) values (gen_random_uuid(), 'x', 'y')",
      "update public.copies set status = 'available'",
    ]) {
      await assert.rejects(withIdentity(api.db, identity(), (scope) => scope.query(statement)), /permission denied|row-level security/, statement);
    }
  });

  it("keeps the revision counter out of a Member's reach", async () => {
    await assert.rejects(
      withIdentity(api.db, identity(), (scope) => scope.query("select revision from public.catalog_revision")),
      /permission denied/,
    );
  });
});
