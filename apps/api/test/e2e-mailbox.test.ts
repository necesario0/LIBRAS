import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { mailboxRoutes } from "../src/testing/mailbox-routes.ts";
import { CapturingEmailSender, codeFromEmail, startTestApi, studentSignUpBody } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("the end-to-end mailbox", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi({
      extraRoutes: (router, deps) => {
        if (!(deps.email instanceof CapturingEmailSender)) throw new Error("The test API should capture emails");
        mailboxRoutes(deps.email)(router);
      },
    });
  });
  after(() => api.close());

  it("lets another process read the verification code the API emailed", async () => {
    const body = studentSignUpBody();
    await fetch(`${api.baseUrl}/members/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const { messages } = await (await fetch(`${api.baseUrl}/e2e/emails?to=${encodeURIComponent(body.email.toUpperCase())}`)).json();

    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, body.email);
    assert.equal(codeFromEmail(messages[0]), codeFromEmail(api.emails.lastTo(body.email)));
  });

  it("forgets the messages when asked", async () => {
    await fetch(`${api.baseUrl}/e2e/emails`, { method: "DELETE" });

    const { messages } = await (await fetch(`${api.baseUrl}/e2e/emails`)).json();

    assert.deepEqual(messages, []);
  });
});

describe("the API that runs in production", () => {
  it("has no mailbox", async () => {
    const api = await startTestApi();
    try {
      const response = await fetch(`${api.baseUrl}/e2e/emails`);
      assert.equal(response.status, 404);
    } finally {
      await api.close();
    }
  });

  it("cannot be swapped for the end-to-end server: that server refuses to start in production", () => {
    const result = spawnSync(process.execPath, ["src/testing/e2e-server.ts"], {
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must never run in production/);
  });
});
