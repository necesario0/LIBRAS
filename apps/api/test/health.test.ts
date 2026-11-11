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
