import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { CatalogSearchResponse } from "@libras/shared";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";

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

  /** Waits for the background rebuild: the ids a search returns, once `done` accepts them. */
  async function idsWhen(query: string, done: (ids: string[]) => boolean): Promise<string[]> {
    const ids = await eventually(async () => (await search(query)).body.results.map((book) => book.id), done);
    assert.ok(done(ids), `the search for "${query}" never reached the expected result, last saw ${JSON.stringify(ids)}`);
    return ids;
  }

  before(async () => {
    api = await startTestApi();
    member = await createTestMember(api);
  });
  after(async () => {
    await api.db.query("delete from public.books where id = any($1)", [bookIds]);
    await api.close();
  });

  it("finds a new Book once the index is rebuilt, and stops finding a deleted one", async () => {
    await search("warm up"); // the index exists before the change
    const word = uniqueWord("qa");
    assert.equal((await search(word)).body.total, 0);

    const id = await addBook(`Brand New ${word}`);
    assert.deepEqual(await idsWhen(word, (ids) => ids.length === 1), [id]);

    await api.db.query("delete from public.books where id = $1", [id]);
    await idsWhen(word, (ids) => ids.length === 0);
  });

  it("finds a Book whose title is edited", async () => {
    const before = uniqueWord("qb");
    const after = uniqueWord("qc");
    const id = await addBook(`Draft ${before}`);
    await idsWhen(before, (ids) => ids.length === 1);
    await api.db.query("update public.books set title = $2 where id = $1", [id, `Final ${after}`]);
    assert.deepEqual(await idsWhen(after, (ids) => ids.length === 1), [id]);
    await idsWhen(before, (ids) => ids.length === 0);
  });

  it("does not fail or lose any search that is in flight while the index is rebuilt and swapped", async () => {
    // Books that exist before and during the whole run: every search for one of them must always find it.
    const steady = uniqueWord("qd");
    const steadyId = await addBook(`Steady ${steady}`);
    await idsWhen(steady, (ids) => ids.length === 1);

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

    // Meanwhile the catalog keeps changing: each insert makes a search start a rebuild in the background.
    const added: string[] = [];
    for (let i = 0; i < 6; i++) {
      const word = uniqueWord("qe");
      added.push(await addBook(`Added during the run ${word}`));
      assert.deepEqual(await idsWhen(word, (ids) => ids.length === 1), [added[i]]);
    }
    changing = false;
    await Promise.all(searchers);

    assert.deepEqual(failures, []);
    assert.ok(completed >= 8, `only ${completed} searches ran`);
  });
});
