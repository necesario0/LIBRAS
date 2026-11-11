import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppError } from "../src/errors.ts";
import { startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

describe("error responses", () => {
  let api: TestApi;
  before(async () => {
    api = await startTestApi({
      extraRoutes: (router) => {
        router.get("/test/boom", () => {
          throw new Error("secret detail: password column missing in table members");
        });
        router.get("/test/refused", () => {
          throw new AppError(409, "copy_on_loan", "This Copy is already on Loan.");
        });
        router.post("/test/echo", (req, res) => {
          res.json(req.body);
        });
        router.get("/test/async-boom", async () => {
          await Promise.resolve();
          throw new TypeError("secret detail: cannot read properties of undefined");
        });
      },
    });
  });
  after(() => api.close());

  for (const path of ["/test/boom", "/test/async-boom"]) {
    it(`answers an unhandled error on ${path} with a safe message and a code, and no stack trace`, async () => {
      const response = await fetch(`${api.baseUrl}${path}`);

      assert.equal(response.status, 500);
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), {
        error: {
          code: "internal_error",
          message: "Something went wrong on our side. Please try again.",
        },
      });
      assert.doesNotMatch(text, /secret detail/);
      assert.doesNotMatch(text, /\bat .+\(.+:\d+:\d+\)/, "a stack frame leaked");
      assert.doesNotMatch(text, /\.ts\b|node_modules|Error:/);
    });
  }

  it("returns the code and message of an error the API raised on purpose", async () => {
    const response = await fetch(`${api.baseUrl}/test/refused`);

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: "copy_on_loan", message: "This Copy is already on Loan." },
    });
  });

  it("answers an unknown address with a not_found code", async () => {
    const response = await fetch(`${api.baseUrl}/no-such-address`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "not_found", message: "This address does not exist." },
    });
  });

  it("answers a body that is not valid JSON with an invalid_json code", async () => {
    const response = await fetch(`${api.baseUrl}/test/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"email": ',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "invalid_json", message: "The request body is not valid JSON." },
    });
  });

  it("answers a body that is too large with a payload_too_large code", async () => {
    const response = await fetch(`${api.baseUrl}/test/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(200_000) }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: { code: "payload_too_large", message: "The request body is too large." },
    });
  });
});
