import assert from "node:assert/strict";
import { createHook } from "node:async_hooks";
import { after, before, describe, it } from "node:test";
import { readEventStream } from "@libras/shared";
import type { DeskScannerEventName, DeskScannerEvents, PairScannerResponse, ScannerStatusResponse } from "@libras/shared";
import { createTestAccount, signInDirect, startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";
import { eventually } from "./eventually.ts";

interface Received {
  name: string;
  payload: unknown;
}

/** The desk page's side: the event stream of one Librarian, read the way the browser reads it. */
class DeskStream {
  readonly #received: Received[] = [];
  readonly #abort: AbortController;
  #read = 0;
  readonly status: number;
  readonly ended: Promise<void>;

  private constructor(response: Response, abort: AbortController) {
    this.status = response.status;
    this.#abort = abort;
    this.ended = this.#pump(response);
  }

  static async open(api: TestApi, token: string | null, deskId?: string): Promise<DeskStream> {
    const abort = new AbortController();
    const query = deskId === undefined ? "" : `?desk=${deskId}`;
    const response = await fetch(`${api.baseUrl}/desk/scanner/events${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: abort.signal,
    });
    return new DeskStream(response, abort);
  }

  async #pump(response: Response): Promise<void> {
    if (!response.ok || !response.body) return;
    try {
      for await (const event of readEventStream(response.body)) {
        this.#received.push({ name: event.event, payload: JSON.parse(event.data) });
      }
    } catch {
      // Closed by the test.
    }
  }

  /** The next event with this name that has not been taken yet (earlier events of other names are skipped). */
  async next<Name extends DeskScannerEventName>(name: Name, timeoutMs = 3000): Promise<DeskScannerEvents[Name]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.#read < this.#received.length) {
        const event = this.#received[this.#read++] as Received;
        if (event.name === name) return event.payload as DeskScannerEvents[Name];
      }
      if (Date.now() > deadline) {
        throw new Error(`No "${name}" event arrived. Got: ${this.#received.map((event) => event.name).join(", ")}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  /** Names of the events that have arrived and have not been taken yet. */
  untaken(): string[] {
    return this.#received.slice(this.#read).map((event) => event.name);
  }

  async close(): Promise<void> {
    this.#abort.abort();
    await this.ended;
  }
}

async function errorCodeOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("The phone as the scanner", () => {
  let api: TestApi;
  let librarian: { accessToken: string };
  let otherLibrarian: { accessToken: string };
  let member: { accessToken: string };
  const open: DeskStream[] = [];

  async function openDesk(token = librarian.accessToken, deskId?: string): Promise<DeskStream> {
    const stream = await DeskStream.open(api, token, deskId);
    open.push(stream);
    return stream;
  }
  const post = (path: string, token: string | null, body?: unknown, baseUrl = api.baseUrl) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  const pair = (code: string, baseUrl = api.baseUrl) => post("/scanner/pair", null, { code }, baseUrl);
  const sendScan = (token: string | null, text: string) => post("/scanner/scans", token, { text });
  const statusOf = (token: string) => fetch(`${api.baseUrl}/scanner/status`, { headers: { authorization: `Bearer ${token}` } });

  async function pairedPhone(desk: DeskStream): Promise<string> {
    const { code } = await desk.next("pairing");
    const response = await pair(code);
    assert.equal(response.status, 200);
    return ((await response.json()) as PairScannerResponse).token;
  }

  /** The desk page has gone, as far as the API can tell. */
  async function closeAndWaitUntilOffline(desk: DeskStream, token: string): Promise<void> {
    await desk.close();
    const status = await eventually(
      async () => (await (await statusOf(token)).json()) as ScannerStatusResponse,
      (body) => !body.deskOnline,
      3000,
    );
    assert.equal(status.deskOnline, false);
  }

  before(async () => {
    // A wide limit here, so the tests that guess wrong do not block each other: the limit has its own test.
    api = await startTestApi({ pairingLimit: { maxFailures: 100, windowMinutes: 5 } });
    const a = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const b = await createTestAccount(api, { staff: { role: "librarian", fullName: "Rosa Dela Cruz" } });
    const m = await createTestAccount(api);
    librarian = { accessToken: (await signInDirect(a.email, a.password)) as string };
    otherLibrarian = { accessToken: (await signInDirect(b.email, b.password)) as string };
    member = { accessToken: (await signInDirect(m.email, m.password)) as string };
  });
  after(async () => {
    await Promise.all(open.map((stream) => stream.close()));
    await api.close();
  });

  describe("the desk page's pairing code", () => {
    it("gives a signed-in Librarian a six-digit code that stops working after two minutes", async () => {
      const desk = await openDesk();

      const { deskId } = await desk.next("desk");
      const { code, expiresAt } = await desk.next("pairing");

      assert.ok(deskId.length >= 16);
      assert.match(code, /^[0-9]{6}$/);
      assert.equal(Date.parse(expiresAt), api.clock.now().getTime() + 120_000);
    });

    it("is refused to anyone who is not a signed-in Librarian", async () => {
      assert.equal((await DeskStream.open(api, null)).status, 401);
      assert.equal((await DeskStream.open(api, "not-a-token")).status, 401);
      assert.equal((await DeskStream.open(api, member.accessToken)).status, 403);
    });

    it("is different for each desk page", async () => {
      const first = await openDesk();
      const second = await openDesk(otherLibrarian.accessToken);

      assert.notEqual((await first.next("pairing")).code, (await second.next("pairing")).code);
    });
  });

  describe("pairing the phone", () => {
    it("links the phone to the desk page that showed the code, and tells the desk page", async () => {
      const desk = await openDesk();
      const { code } = await desk.next("pairing");

      const response = await pair(code);

      assert.equal(response.status, 200);
      const body = (await response.json()) as PairScannerResponse;
      assert.ok(body.token.length >= 32);
      assert.deepEqual(await desk.next("paired"), {});
      // The phone is told nothing about the Librarian: the token is all it gets.
      assert.deepEqual(Object.keys(body), ["token"]);
    });

    it("accepts the code typed with a space in the middle", async () => {
      const desk = await openDesk();
      const { code } = await desk.next("pairing");

      const response = await pair(`${code.slice(0, 3)} ${code.slice(3)}`);

      assert.equal(response.status, 200);
    });

    it("works once: the same code cannot pair a second phone", async () => {
      const desk = await openDesk();
      const { code } = await desk.next("pairing");
      assert.equal((await pair(code)).status, 200);

      const again = await pair(code);

      assert.equal(again.status, 403);
      assert.equal(await errorCodeOf(again), "pairing_code_invalid");
    });

    it("refuses a wrong code with a clear message", async () => {
      const response = await pair("000000");

      assert.equal(response.status, 403);
      const { error } = (await response.json()) as { error: { code: string; message: string } };
      assert.equal(error.code, "pairing_code_invalid");
      assert.match(error.message, /wrong or has expired/);
    });

    it("refuses a code that is not six digits", async () => {
      const response = await pair("12ab");

      assert.equal(response.status, 400);
      assert.equal(await errorCodeOf(response), "invalid_request");
    });

    it("refuses a code after its two minutes are up, with the same message as a wrong code", async () => {
      const desk = await openDesk();
      const { code } = await desk.next("pairing");
      api.clock.advance({ seconds: 121 });

      const response = await pair(code);

      assert.equal(response.status, 403);
      assert.equal(await errorCodeOf(response), "pairing_code_invalid");
    });

    it("blocks a client address that keeps guessing, even when the next guess is right, until the window passes", async () => {
      const limited = await startTestApi({ pairingLimit: { maxFailures: 3, windowMinutes: 5 } });
      try {
        const account = await createTestAccount(limited, { staff: { role: "librarian", fullName: "Limit Test" } });
        const token = (await signInDirect(account.email, account.password)) as string;
        const desk = await DeskStream.open(limited, token);
        open.push(desk);
        const { code } = await desk.next("pairing");
        for (let i = 0; i < 3; i += 1) assert.equal((await pair("000000", limited.baseUrl)).status, 403);

        const blocked = await pair(code, limited.baseUrl);

        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("retry-after")) > 0);
        assert.equal(await errorCodeOf(blocked), "too_many_attempts");
        assert.match(((await (await pair(code, limited.baseUrl)).json()) as { error: { message: string } }).error.message, /pairing code/);
        limited.clock.advance({ minutes: 6 });
        assert.equal((await pair(code, limited.baseUrl)).status, 403, "the block has ended, and the code itself has expired");
      } finally {
        await limited.close();
      }
    });
  });

  describe("scans from the paired phone", () => {
    it("reach the desk page, in order, trimmed", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);

      assert.equal((await sendScan(token, "482109375512")).status, 202);
      assert.equal((await sendScan(token, " 3100000001\n")).status, 202);

      assert.deepEqual(await desk.next("scan"), { text: "482109375512" });
      assert.deepEqual(await desk.next("scan"), { text: "3100000001" });
    });

    it("never reach another Librarian's desk page", async () => {
      const mine = await openDesk();
      const theirs = await openDesk(otherLibrarian.accessToken);
      const token = await pairedPhone(mine);

      await sendScan(token, "3100000002");

      assert.deepEqual(await mine.next("scan"), { text: "3100000002" });
      assert.deepEqual(
        theirs.untaken().filter((name) => name === "scan"),
        [],
      );
    });

    it("must pass the scan whitelist before the desk page sees them", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);

      for (const text of ["4821<script>", "   ", "x".repeat(65), "AC-0000001; drop table loans"]) {
        const response = await sendScan(token, text);
        assert.equal(response.status, 400, text);
        assert.equal(await errorCodeOf(response), "scan_rejected");
      }
      assert.equal((await post("/scanner/scans", token, { text: 5 })).status, 400);
      assert.equal((await post("/scanner/scans", token, { text: "1", extra: true })).status, 400);

      await sendScan(token, "AC-0000001");
      assert.deepEqual(await desk.next("scan"), { text: "AC-0000001" });
    });

    it("are refused without a scanner token, or with a token that was never issued", async () => {
      assert.equal((await sendScan(null, "3100000001")).status, 401);
      const response = await sendScan("a".repeat(43), "3100000001");
      assert.equal(response.status, 401);
      assert.equal(await errorCodeOf(response), "pairing_lost");
    });

    it("are refused when sent as the Librarian instead of with a scanner token", async () => {
      const desk = await openDesk();
      await pairedPhone(desk);

      assert.equal((await sendScan(librarian.accessToken, "3100000001")).status, 401);
    });

    it("are slowed down when a phone sends far too many", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);

      const statuses: number[] = [];
      for (let i = 0; i < 40; i += 1) statuses.push((await sendScan(token, "3100000003")).status);

      assert.equal(statuses[0], 202);
      assert.ok(statuses.includes(429));
    });

    it("are told the desk page is offline while its stream is closed, and are accepted again when it comes back", async () => {
      const desk = await openDesk();
      const { deskId } = await desk.next("desk");
      const token = await pairedPhone(desk);
      await closeAndWaitUntilOffline(desk, token);

      const offline = await sendScan(token, "3100000004");
      assert.equal(offline.status, 409);
      assert.equal(await errorCodeOf(offline), "desk_offline");

      const back = await openDesk(librarian.accessToken, deskId);
      assert.equal((await back.next("desk")).deskId, deskId);
      assert.equal((await sendScan(token, "3100000005")).status, 202);
      assert.deepEqual(await back.next("scan"), { text: "3100000005" });
    });

    it("lose their pairing for good when the desk page stays away for more than a minute", async () => {
      const desk = await openDesk();
      const { deskId } = await desk.next("desk");
      const token = await pairedPhone(desk);
      await closeAndWaitUntilOffline(desk, token);
      api.clock.advance({ seconds: 61 });

      const response = await sendScan(token, "3100000006");

      assert.equal(response.status, 401);
      assert.equal(await errorCodeOf(response), "pairing_lost");
      // The desk page cannot take the old pairing back: it gets a new desk id.
      const back = await openDesk(librarian.accessToken, deskId);
      assert.notEqual((await back.next("desk")).deskId, deskId);
    });

    it("cannot be taken over by another Librarian who knows the desk id", async () => {
      const desk = await openDesk();
      const { deskId } = await desk.next("desk");
      const token = await pairedPhone(desk);
      await closeAndWaitUntilOffline(desk, token);

      const theirs = await openDesk(otherLibrarian.accessToken, deskId);

      assert.notEqual((await theirs.next("desk")).deskId, deskId);
      assert.equal((await sendScan(token, "3100000007")).status, 409, "the phone is still waiting for its own desk page");
      assert.deepEqual(
        theirs.untaken().filter((name) => name === "scan"),
        [],
      );
    });
  });

  describe("what a scanner token can do", () => {
    it("is nothing but send scans: every Librarian and Member endpoint refuses it", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);
      const asBearer = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      const attempts: [string, string][] = [
        ["GET", "/staff/me"],
        ["POST", "/desk/members/identify"],
        ["POST", "/desk/loans"],
        ["POST", "/desk/returns"],
        ["GET", "/desk/scanner/events"],
        ["POST", "/desk/scanner/unpair"],
        ["GET", "/members/me/loans"],
        ["GET", "/members/me/digital-id"],
      ];
      for (const [method, path] of attempts) {
        const response = await fetch(`${api.baseUrl}${path}`, {
          method,
          headers: asBearer,
          body: method === "POST" ? "{}" : undefined,
        });
        assert.equal(response.status, 401, `${method} ${path}`);
      }
    });

    it("also shows whether the pairing still stands", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);

      const response = await statusOf(token);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deskOnline: true } satisfies ScannerStatusResponse);
      assert.equal((await fetch(`${api.baseUrl}/scanner/status`)).status, 401);
    });
  });

  describe("ending a pairing", () => {
    it("lets the Librarian unpair from the desk page: the phone loses its pairing and the desk page shows a new code", async () => {
      const desk = await openDesk();
      const { deskId } = await desk.next("desk");
      const token = await pairedPhone(desk);

      const response = await post("/desk/scanner/unpair", librarian.accessToken, { deskId });

      assert.equal(response.status, 204);
      assert.deepEqual(await desk.next("unpaired"), {});
      assert.match((await desk.next("pairing")).code, /^[0-9]{6}$/);
      assert.equal((await sendScan(token, "3100000008")).status, 401);
    });

    it("does not let another Librarian unpair this desk page", async () => {
      const desk = await openDesk();
      const { deskId } = await desk.next("desk");
      const token = await pairedPhone(desk);

      const response = await post("/desk/scanner/unpair", otherLibrarian.accessToken, { deskId });

      assert.equal(response.status, 204, "the answer does not say whether the desk id exists");
      assert.equal((await sendScan(token, "3100000009")).status, 202);
    });

    it("lets the phone leave: the desk page is told and shows a new code", async () => {
      const desk = await openDesk();
      const token = await pairedPhone(desk);

      const response = await fetch(`${api.baseUrl}/scanner/pairing`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.status, 204);
      assert.deepEqual(await desk.next("unpaired"), {});
      assert.equal((await sendScan(token, "3100000010")).status, 401);
      await desk.next("pairing");
    });

    it("ends the stream on its own after its time is up, so a signed-out session cannot keep a pairing for ever", async () => {
      const short = await startTestApi({ scanner: { streamSeconds: 1 } });
      try {
        const account = await createTestAccount(short, { staff: { role: "librarian", fullName: "Short Stream" } });
        const token = (await signInDirect(account.email, account.password)) as string;
        const desk = await DeskStream.open(short, token);
        await desk.next("desk");

        await desk.next("end", 5000);
        await desk.ended;
      } finally {
        await short.close();
      }
    });
  });
});

describe("Closing the API", () => {
  it("ends the desk streams and leaves none of the API's timers running", async () => {
    // Every timer the API's own code starts, until it is cleared or has fired. The time limits of its
    // outgoing requests (AbortSignal.timeout) end by themselves and are left out.
    const live = new Map<number, string>();
    const hook = createHook({
      init(asyncId, type) {
        if (type !== "Timeout") return;
        const stack = new Error().stack ?? "";
        if (/apps[\\/]api[\\/]src[\\/]/.test(stack) && !stack.includes("AbortSignal.timeout")) live.set(asyncId, stack);
      },
      destroy(asyncId) {
        live.delete(asyncId);
      },
    }).enable();
    try {
      const api = await startTestApi();
      const account = await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } });
      const token = await signInDirect(account.email, account.password);
      assert.ok(token);
      const desk = await DeskStream.open(api, token);
      await desk.next("pairing");
      assert.ok(live.size > 0, "the hub and the stream start timers");

      await api.close();

      await desk.ended;
      await eventually(
        async () => live.size,
        (size) => size === 0,
        2000,
      );
      assert.deepEqual([...live.values()], []);
    } finally {
      hook.disable();
    }
  });
});
