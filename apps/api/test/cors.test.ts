import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

const DESK = "https://libras-desk.onrender.com";

describe("CORS with an allowlist", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi({ corsAllowedOrigins: [DESK] });
  });
  after(() => api.close());

  it("lets a page on an allowed origin read a response", async () => {
    const response = await fetch(`${api.baseUrl}/health`, { headers: { origin: DESK } });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), DESK);
    assert.match(response.headers.get("vary") ?? "", /Origin/i);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });

  it("answers a preflight from an allowed origin with the methods and headers the clients use", async () => {
    const response = await fetch(`${api.baseUrl}/staff/sign-in`, {
      method: "OPTIONS",
      headers: {
        origin: DESK,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), DESK);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/i);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /content-type/i);
  });

  it("gives another origin no permission, in a response or a preflight", async () => {
    const evil = "https://evil.example";

    const simple = await fetch(`${api.baseUrl}/health`, { headers: { origin: evil } });
    const preflight = await fetch(`${api.baseUrl}/staff/sign-in`, {
      method: "OPTIONS",
      headers: { origin: evil, "access-control-request-method": "POST" },
    });

    assert.equal(simple.headers.get("access-control-allow-origin"), null);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
    assert.equal(preflight.headers.get("access-control-allow-methods"), null);
  });

  it("does not touch a request with no Origin, such as the mobile app", async () => {
    const response = await fetch(`${api.baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

describe("CORS with no allowlist (the default)", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi();
  });
  after(() => api.close());

  it("grants no origin any permission", async () => {
    const response = await fetch(`${api.baseUrl}/health`, { headers: { origin: DESK } });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
