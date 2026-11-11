import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { CatalogSearchResponse } from "@libras/shared";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

function uniqueWord(prefix: string): string {
  const letters = randomUUID().replaceAll("-", "").replace(/[0-9]/g, (digit) => "abcdefghij"[Number(digit)] ?? "a");
  return `${prefix}${letters.slice(0, 10)}`;
}

describe("when the catalog changes", () => {
  let api: TestApi;
  let member: TestMember;
  const bookIds: string[] = [];

  async function addBook(title: string): Promise<string> {
    const { rows } = await api.db.query("insert into public.books (title, authors) values ($1, '{}') returning id", [title]);
    bookIds.push(rows[0].id);
    return rows[0].id;
  }

  async function search(query: string): Promise<{ status: number; body: CatalogSearchResponse }> {
    const response = await fetch(`${api.baseUrl}/catalog/search?q=${encodeURIComponent(query)}`, {
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    return { status: response.status, body: (await response.json()) as CatalogSearchResponse };
  }

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
  });
  after(async () => {
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  it("finds a new Book on the next search, and stops finding a deleted one", async () => {
    await search("warm up"); // the index exists before the change
    const word = uniqueWord("qa");
    assert.equal((await search(word)).body.total, 0);

    const id = await addBook(`Brand New ${word}`);
    assert.deepEqual((await search(word)).body.results.map((book) => book.id), [id]);

    await api.db.query("delete from public.books where id = $1", [id]);
    assert.equal((await search(word)).body.total, 0);
  });

  it("finds a Book whose title is edited", async () => {
    const before = uniqueWord("qb");
    const after = uniqueWord("qc");
    const id = await addBook(`Draft ${before}`);
    assert.equal((await search(before)).body.total, 1);
    await api.db.query("update public.books set title = $2 where id = $1", [id, `Final ${after}`]);
    assert.equal((await search(before)).body.total, 0);
    assert.deepEqual((await search(after)).body.results.map((book) => book.id), [id]);
  });

  it("does not fail or lose any search that is in flight while the index is rebuilt and swapped", async () => {
    // Books that exist before and during the whole run: every search for one of them must always find it.
    const steady = uniqueWord("qd");
    const steadyId = await addBook(`Steady ${steady}`);
    await search(steady);

    let changing = true;
    const failures: string[] = [];
    let completed = 0;
    const searcher = async (): Promise<void> => {
      while (changing) {
        const { status, body } = await search(steady);
        completed += 1;
        if (status !== 200) failures.push(`status ${status}`);
        else if (body.results.map((book) => book.id).join() !== steadyId) failures.push(`wrong results ${JSON.stringify(body)}`);
      }
    };
    const searchers = Array.from({ length: 8 }, searcher);

    // Meanwhile the catalog keeps changing: each insert makes the next search rebuild the index.
    const added: string[] = [];
    for (let i = 0; i < 6; i++) {
      const word = uniqueWord("qe");
      added.push(await addBook(`Added during the run ${word}`));
      assert.deepEqual((await search(word)).body.results.map((book) => book.id), [added[i]]);
    }
    changing = false;
    await Promise.all(searchers);

    assert.deepEqual(failures, []);
    assert.ok(completed >= 8, `only ${completed} searches ran`);
  });
});
