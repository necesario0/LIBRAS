import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { seedLibrarians } from "../src/seed/librarians.ts";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

async function signIn(api: TestApi, email: string, password: string): Promise<Response> {
  return fetch(`${api.baseUrl}/staff/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("seed script: Librarian accounts", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("creates a Librarian who can sign in on the desk page", async () => {
    const email = `seed-${randomUUID()}@example.com`;

    await seedLibrarians(api.db, [{ email, password: "first-password-1", fullName: "Seeded Librarian" }]);

    const response = await signIn(api, email, "first-password-1");
    assert.equal(response.status, 200);
    const { staff } = await response.json();
    assert.equal(staff.fullName, "Seeded Librarian");
    assert.equal(staff.role, "librarian");
  });

  it("can run again: it resets the password and creates no duplicate", async () => {
    const email = `seed-${randomUUID()}@example.com`;
    await seedLibrarians(api.db, [{ email, password: "first-password-1", fullName: "Seeded Librarian" }]);

    await seedLibrarians(api.db, [{ email, password: "second-password-2", fullName: "Renamed Librarian" }]);

    assert.equal((await signIn(api, email, "first-password-1")).status, 401);
    const response = await signIn(api, email, "second-password-2");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).staff.fullName, "Renamed Librarian");
    const { rows } = await api.db.query("select count(*)::int as n from public.staff s join auth.users u on u.id = s.user_id where u.email = $1", [email]);
    assert.equal(rows[0].n, 1);
  });
});
