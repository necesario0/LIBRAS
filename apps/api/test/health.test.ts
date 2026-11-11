import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("GET /health", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("reports ok when the API can reach PostgreSQL", async () => {
    const response = await fetch(`${api.baseUrl}/health`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.database, "ok");
  });
});

describe("GET /health when PostgreSQL cannot be reached", () => {
  let api: TestApi;
  before(async () => {
    // Port 9 (discard) has no PostgreSQL behind it.
    api = await startTestApi({ databaseUrl: "postgresql://postgres:postgres@127.0.0.1:9/postgres" });
  });
  after(() => api.close());

  it("reports the service as unavailable with a code and no internal detail", async () => {
    const response = await fetch(`${api.baseUrl}/health`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: "database_unavailable",
        message: "The service is temporarily unavailable. Please try again.",
      },
    });
  });
});
