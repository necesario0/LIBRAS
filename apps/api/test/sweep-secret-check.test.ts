import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { PICKUP_SWEEP_PATH, checkSweepSecret } from "../scripts/pickup-sweep-schedule.ts";

const GOOD_SECRET = "sweep-check-test-secret-0123456789abcdef0123456789";

/** What `npm run schedule:hosted` tells the developer after it asks the API about the secret. */
describe("The check that the API accepts the sweep secret", () => {
  let server: Server;
  let apiUrl = "";
  let mode: "accept" | "not-found" | "unauthorized" | "broken" = "accept";
  const requests: { method?: string; path?: string; authorization?: string }[] = [];

  before(async () => {
    server = createServer((req, res) => {
      requests.push({ method: req.method, path: req.url, authorization: req.headers.authorization });
      const answer = { accept: [200, { expired: 0 }], "not-found": [404, {}], unauthorized: [401, {}], broken: [500, {}] }[mode] as [number, object];
      res.writeHead(answer[0], { "content-type": "application/json" }).end(JSON.stringify(answer[1]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("calls the sweep endpoint with the secret as a bearer token and, when it is accepted, says the schedule works and asks for nothing more", async () => {
    mode = "accept";
    requests.length = 0;
    const check = await checkSweepSecret({ apiUrl, secret: GOOD_SECRET });

    assert.equal(check.accepted, true);
    assert.deepEqual(requests, [{ method: "POST", path: PICKUP_SWEEP_PATH, authorization: `Bearer ${GOOD_SECRET}` }]);
    assert.match(check.message, /the schedule works/);
    assert.doesNotMatch(check.message, /Render/, "nothing is left for the developer to do");
    assert.ok(!check.message.includes(GOOD_SECRET));
  });

  it("asks the developer to add SWEEP_SECRET in Render when the API has no sweep endpoint (404)", async () => {
    mode = "not-found";
    const check = await checkSweepSecret({ apiUrl, secret: GOOD_SECRET });

    assert.equal(check.accepted, false);
    assert.match(check.message, /Render dashboard/);
    assert.match(check.message, /SWEEP_SECRET/);
    assert.ok(!check.message.includes(GOOD_SECRET));
  });

  it("says the value differs when the API refuses the secret (401)", async () => {
    mode = "unauthorized";
    const check = await checkSweepSecret({ apiUrl, secret: GOOD_SECRET });

    assert.equal(check.accepted, false);
    assert.match(check.message, /differs from the one in \.env\.hosted/);
  });

  it("reports another status or no answer without claiming success", async () => {
    mode = "broken";
    const broken = await checkSweepSecret({ apiUrl, secret: GOOD_SECRET });
    assert.equal(broken.accepted, false);
    assert.match(broken.message, /answered 500/);

    const silent = await checkSweepSecret({ apiUrl: "http://127.0.0.1:1/", secret: GOOD_SECRET, timeoutMs: 2000 });
    assert.equal(silent.accepted, false);
    assert.match(silent.message, /did not answer/);
  });
});
