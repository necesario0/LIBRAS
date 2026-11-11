import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("the HTTP test harness", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi({
      extraRoutes: (router, { email }) => {
        router.post("/test/send-email", async (req, res) => {
          await email.send({ to: req.body.to, subject: "Your Hold is ready", text: "Pick up your Copy at the desk." });
          res.status(204).end();
        });
      },
    });
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

  it("captures the emails the API sends, so a test can read them", async () => {
    assert.deepEqual(api.emails.sent, []);

    const response = await fetch(`${api.baseUrl}/test/send-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "ana.reyes@umak.edu.ph" }),
    });

    assert.equal(response.status, 204);
    assert.deepEqual(api.emails.sent, [
      { to: "ana.reyes@umak.edu.ph", subject: "Your Hold is ready", text: "Pick up your Copy at the desk." },
    ]);
    assert.equal(api.emails.lastTo("ana.reyes@umak.edu.ph")?.subject, "Your Hold is ready");
    assert.equal(api.emails.lastTo("someone.else@example.com"), undefined);

    api.emails.clear();
    assert.deepEqual(api.emails.sent, []);
  });
});
