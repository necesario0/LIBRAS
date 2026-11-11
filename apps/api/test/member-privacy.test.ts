import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { withIdentity } from "../src/auth/index.ts";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

function getJson(url: string, accessToken?: string): Promise<Response> {
  return fetch(url, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
}

describe("a Member's profile is private", () => {
  let api: TestApi;
  let ana: TestMember;
  let ben: TestMember;

  before(async () => {
    // A route that asks PostgreSQL for any Member's row as whoever is signed in, with no check
    // of its own. It stands in for a bug in the API: row-level security is the second layer.
    api = await startTestApi({
      extraRoutes: (router, deps) => {
        router.get("/test/member-row/:userId", async (req, res) => {
          const token = req.get("authorization")?.replace("Bearer ", "") ?? "";
          const identity = await deps.auth.identify(token);
          if (!identity) {
            res.status(401).end();
            return;
          }
          const rows = await withIdentity(deps.db, identity, async (scope) => {
            const result = await scope.query("select user_id, first_name from public.members where user_id = $1", [
              req.params.userId,
            ]);
            return result.rows;
          });
          res.json({ rows });
        });
      },
    });
    ana = await createTestMember(api, { firstName: "Ana" });
    ben = await createTestMember(api, { firstName: "Ben" });
  });
  after(() => api.close());

  it("gives a Member their own profile", async () => {
    const response = await getJson(`${api.baseUrl}/members/me`, ana.accessToken);

    assert.equal(response.status, 200);
    const { member } = await response.json();
    assert.equal(member.id, ana.member.id);
    assert.equal(member.firstName, "Ana");
  });

  it("lets PostgreSQL itself refuse one Member another Member's row", async () => {
    const ownRow = await (await getJson(`${api.baseUrl}/test/member-row/${ana.member.id}`, ana.accessToken)).json();
    const othersRow = await (await getJson(`${api.baseUrl}/test/member-row/${ben.member.id}`, ana.accessToken)).json();

    assert.equal(ownRow.rows.length, 1);
    assert.deepEqual(othersRow.rows, []);
  });

  it("does not let a Member change profiles or read pending sign-ups", async () => {
    const outcomes = await withIdentity(api.db, { userId: ana.member.id, email: ana.email }, async (scope) => {
      const attempts: string[] = [];
      for (const sql of [
        "update public.members set first_name = 'Hacked'",
        "delete from public.members",
        "select 1 from public.signup_requests",
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

    assert.deepEqual(outcomes, ["refused", "refused", "refused"]);
  });

  it("asks for a sign-in", async () => {
    assert.equal((await getJson(`${api.baseUrl}/members/me`)).status, 401);
    assert.equal((await getJson(`${api.baseUrl}/members/me`, "not-a-token")).status, 401);
  });

  it("does not treat a Librarian as a Member", async () => {
    const librarian = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const signedIn = await (
      await fetch(`${api.baseUrl}/staff/sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: librarian.email, password: librarian.password }),
      })
    ).json();

    const response = await getJson(`${api.baseUrl}/members/me`, signedIn.session.accessToken);

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "not_member");
  });
});
