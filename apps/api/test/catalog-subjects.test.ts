import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { SUBJECTS, subjectFor } from "@libras/shared";
import type { CatalogSubjectsResponse, Subject } from "@libras/shared";
import { createTestAccount, createTestMember, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";

/** A call number for each Subject, to add a Book in a Subject the catalog does not have yet. */
const CALL_NUMBER_IN: Partial<Record<Subject, string>> = {
  "Maritime Studies": "VK555 .T3",
  Agriculture: "S494.5 .T3",
  Music: "ML160 .T3",
  "Earth Sciences": "QE26.3 .T3",
  "NSTP and Military Science": "U21.2 .T3",
  Ethics: "BJ1012 .T3",
  "Library and Information Science": "Z665 .T3",
};

describe("GET /catalog/subjects", () => {
  let api: TestApi;
  let member: TestMember;
  const bookIds: string[] = [];

  async function subjects(token: string | null = member.accessToken): Promise<Response> {
    return fetch(`${api.baseUrl}/catalog/subjects`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  }

  async function listed(): Promise<Subject[]> {
    const response = await subjects();
    assert.equal(response.status, 200);
    return ((await response.json()) as CatalogSubjectsResponse).subjects;
  }

  /** The Subjects of the Books in the database now, in table order: what the endpoint should list. */
  async function subjectsInCatalog(): Promise<Subject[]> {
    const { rows } = await api.db.query<{ lc_call_number: string | null }>("select distinct lc_call_number from public.books");
    const present = new Set(rows.map((row) => subjectFor(row.lc_call_number)));
    return SUBJECTS.filter((subject) => present.has(subject));
  }

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
  });
  after(async () => {
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  it("lists only the Subjects that have at least one Book, in table order", async () => {
    const expected = await subjectsInCatalog();
    assert.deepEqual(await eventually(listed, (got) => got.length === expected.length), expected);
  });

  it("adds a Subject once a Book in it is in the catalog, and drops it when the Book goes", async () => {
    const before = await subjectsInCatalog();
    const missing = (Object.keys(CALL_NUMBER_IN) as Subject[]).find((subject) => !before.includes(subject));
    assert.ok(missing, "the test needs a Subject the shared database has no Book in");
    const { rows } = await api.db.query<{ id: string }>(
      "insert into public.books (title, authors, lc_call_number) values ($1, '{}', $2) returning id",
      [`Subjects ${randomUUID()}`, CALL_NUMBER_IN[missing]],
    );
    const id = rows[0]?.id ?? "";
    bookIds.push(id);
    assert.ok((await eventually(listed, (got) => got.includes(missing))).includes(missing));

    await api.db.query("delete from public.books where id = $1", [id]);
    assert.ok(!(await eventually(listed, (got) => !got.includes(missing))).includes(missing));
  });

  it("refuses a request that is not signed in, and an account that is not a Member", async () => {
    const anonymous = await subjects(null);
    assert.equal(anonymous.status, 401);
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lib Rarian" } });
    const staff = await subjects((await signInDirect(librarian.email, librarian.password)) ?? null);
    assert.equal(staff.status, 403);
  });
});
