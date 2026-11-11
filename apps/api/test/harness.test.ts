import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("the HTTP test harness", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("lets a test set the clock the API runs on", async () => {
    api.clock.set("2026-11-24T08:00:00.000Z");
    const first = await (await fetch(`${api.baseUrl}/health`)).json();
    assert.equal(first.time, "2026-11-24T08:00:00.000Z");

    api.clock.advance({ seconds: 61 });
    const second = await (await fetch(`${api.baseUrl}/health`)).json();
    assert.equal(second.time, "2026-11-24T08:01:01.000Z");
  });
});
