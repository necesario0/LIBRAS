import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { CancelHoldResponse, MyHoldsResponse, PlaceHoldResponse } from "@libras/shared";
import { withIdentity } from "../src/auth/index.ts";
import { HOLD_WEIGHT_HOURS, holdScore } from "../src/holds/priority.ts";
import { createTestAccount, createTestMember, createTestMemberOfType, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

type CopyStatus = "available" | "on_loan" | "set_aside";

/** The things both groups of tests do: add Books with Copies, call the API, clean up. */
function holdsHarness() {
  const bookIds: string[] = [];
  const state: { api?: TestApi } = {};
  const api = () => {
    if (!state.api) throw new Error("The API is not started");
    return state.api;
  };

  return {
    api,
    start: async (options: Parameters<typeof startTestApi>[0] = {}) => {
      state.api = await startTestApi(options);
    },
    stop: async () => {
      try {
        await api().db.query("delete from public.holds where book_id = any($1)", [bookIds]);
        await api().db.query("delete from public.copies where book_id = any($1)", [bookIds]);
        await api().db.query("delete from public.books where id = any($1)", [bookIds]);
      } finally {
        await api().close();
      }
    },
    /** A Book whose Copies have these statuses. */
    addBook: async (title: string, copyStatuses: CopyStatus[] = ["on_loan"]): Promise<string> => {
      const { rows } = await api().db.query("insert into public.books (title, authors) values ($1, $2) returning id", [title, ["Reyes, Ana"]]);
      const id: string = rows[0].id;
      bookIds.push(id);
      for (const status of copyStatuses) {
        await api().db.query("insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4)", [
          id,
          `H-${randomUUID()}`,
          `H-${randomUUID()}`,
          status,
        ]);
      }
      return id;
    },
    send: (method: string, path: string, token: string | null, body?: unknown) =>
      fetch(`${api().baseUrl}${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

describe("Holds: placing one", () => {
  const h = holdsHarness();
  let ana: TestMember;

  const placeHold = (token: string | null, bookId: unknown) => h.send("POST", "/holds", token, { bookId });
  const myHolds = async (member: TestMember) =>
    ((await (await h.send("GET", "/members/me/holds", member.accessToken)).json()) as MyHoldsResponse).holds;

  before(async () => {
    await h.start();
    ana = await createTestMember(h.api(), { firstName: "Ana" });
  });
  after(() => h.stop());

  it("puts the Member in the Book's queue as waiting when no Copy is available", async () => {
    h.api().clock.set("2026-11-20T08:00:00.000Z");
    const bookId = await h.addBook("Everything Is Out", ["on_loan", "set_aside"]);

    const response = await placeHold(ana.accessToken, bookId);

    assert.equal(response.status, 201);
    const { hold } = (await response.json()) as PlaceHoldResponse;
    assert.equal(hold.status, "waiting");
    assert.equal(hold.bookId, bookId);
    assert.equal(hold.bookTitle, "Everything Is Out");
    assert.equal(hold.placedAt, "2026-11-20T08:00:00.000Z");
    assert.deepEqual(await myHolds(ana), [hold]);
  });

  it("refuses a Book that has an available Copy and says to borrow it", async () => {
    const bookId = await h.addBook("Plenty On The Shelf", ["on_loan", "available"]);

    const response = await placeHold(ana.accessToken, bookId);

    assert.equal(response.status, 409);
    const { error } = await response.json();
    assert.equal(error.code, "copy_available");
    assert.match(error.message, /borrow/i);
    assert.equal((await myHolds(ana)).some((hold) => hold.bookId === bookId), false);
  });

  it("allows a Hold on a Book with no Copies at all", async () => {
    const bookId = await h.addBook("Not Yet Catalogued", []);
    assert.equal((await placeHold(ana.accessToken, bookId)).status, 201);
  });

  it("refuses a second Hold on the same Book by the same Member, with a clear message", async () => {
    const bookId = await h.addBook("Popular");
    assert.equal((await placeHold(ana.accessToken, bookId)).status, 201);

    const again = await placeHold(ana.accessToken, bookId);

    assert.equal(again.status, 409);
    const { error } = await again.json();
    assert.equal(error.code, "hold_exists");
    assert.match(error.message, /already have a Hold/);
    assert.equal((await myHolds(ana)).filter((hold) => hold.bookId === bookId).length, 1);
  });

  it("lets two Members hold the same Book, and one Member hold two Books", async () => {
    const first = await h.addBook("Shared Want");
    const second = await h.addBook("Second Want");
    const ben = await createTestMember(h.api(), { firstName: "Ben" });

    assert.equal((await placeHold(ana.accessToken, first)).status, 201);
    assert.equal((await placeHold(ben.accessToken, first)).status, 201);
    assert.equal((await placeHold(ana.accessToken, second)).status, 201);
  });

  it("refuses two requests at once for the same Book: exactly one Hold is placed", async () => {
    const bookId = await h.addBook("Double Tap");
    const responses = await Promise.all([placeHold(ana.accessToken, bookId), placeHold(ana.accessToken, bookId)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  });

  for (const accountType of ["visitor", "alumni"] as const) {
    it(`refuses a Member whose Account Type is ${accountType}: it cannot borrow`, async () => {
      const bookId = await h.addBook(`No Hold For ${accountType}`);
      const member = await createTestMemberOfType(h.api(), accountType);

      const response = await placeHold(member.accessToken, bookId);

      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "cannot_borrow");
      assert.deepEqual(await myHolds(member), []);
    });
  }

  it("answers 404 for a Book that does not exist and 400 for a request that is not a Book id", async () => {
    const missing = await placeHold(ana.accessToken, randomUUID());
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, "book_not_found");

    for (const bookId of ["not-a-uuid", 42, null, undefined, "' or 1=1 --"]) {
      const response = await placeHold(ana.accessToken, bookId);
      assert.equal(response.status, 400, String(bookId));
      assert.equal((await response.json()).error.code, "invalid_request");
    }
    const extra = await h.send("POST", "/holds", ana.accessToken, { bookId: randomUUID(), memberId: randomUUID() });
    assert.equal(extra.status, 400);
  });

  it("asks for a Member who is signed in", async () => {
    const bookId = await h.addBook("Locked");
    assert.equal((await placeHold(null, bookId)).status, 401);
    assert.equal((await h.send("GET", "/members/me/holds", null)).status, 401);
    assert.equal((await h.send("POST", `/holds/${randomUUID()}/cancel`, null)).status, 401);

    const librarian = await createTestAccount(h.api(), { staff: { role: "librarian", fullName: "Lita Reyes" } });
    const signedIn = await (
      await fetch(`${h.api().baseUrl}/staff/sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: librarian.email, password: librarian.password }),
      })
    ).json();
    const response = await placeHold(signedIn.session.accessToken, bookId);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "not_member");
  });
});

describe("Holds: seeing and cancelling them", () => {
  const h = holdsHarness();
  let ana: TestMember;
  let ben: TestMember;

  const place = async (member: TestMember, bookId: string) =>
    ((await (await h.send("POST", "/holds", member.accessToken, { bookId })).json()) as PlaceHoldResponse).hold;
  const holdsOf = async (member: TestMember) =>
    ((await (await h.send("GET", "/members/me/holds", member.accessToken)).json()) as MyHoldsResponse).holds;
  const cancel = (member: TestMember, holdId: string) => h.send("POST", `/holds/${holdId}/cancel`, member.accessToken);
  /** The Book's queue in dispatch order: waiting Holds by score, then sequence. */
  const queueOf = async (bookId: string) =>
    (
      await h.api().db.query("select member_id from public.holds where book_id = $1 and status = 'waiting' order by score, seq", [bookId])
    ).rows.map((row) => row.member_id);

  before(async () => {
    await h.start({
      // A route that asks PostgreSQL for any Hold as whoever is signed in, with no check of its
      // own. It stands in for a bug in the API: row-level security is the second layer.
      extraRoutes: (router, deps) => {
        router.get("/test/hold-rows/:bookId", async (req, res) => {
          const identity = await deps.auth.identify(req.get("authorization")?.replace("Bearer ", "") ?? "");
          if (!identity) {
            res.status(401).end();
            return;
          }
          const rows = await withIdentity(deps.db, identity, async (scope) => {
            const result = await scope.query("select id, member_id from public.holds where book_id = $1", [req.params.bookId]);
            return result.rows;
          });
          res.json({ rows });
        });
      },
    });
    ana = await createTestMember(h.api(), { firstName: "Ana" });
    ben = await createTestMember(h.api(), { firstName: "Ben" });
  });
  after(() => h.stop());

  it("shows a Member their Holds with each status, active ones first and newest first", async () => {
    h.api().clock.set("2026-11-20T08:00:00.000Z");
    const [a, b, c] = [await h.addBook("First Held"), await h.addBook("Second Held"), await h.addBook("Third Held")] as [string, string, string];
    const first = await place(ana, a);
    h.api().clock.advance({ minutes: 5 });
    const second = await place(ana, b);
    h.api().clock.advance({ minutes: 5 });
    const third = await place(ana, c);
    assert.equal((await cancel(ana, second.id)).status, 200);
    // A return moves a Hold to ready (test/hold-dispatch.test.ts): arrange the state here.
    await h.api().db.query(
      `update public.holds
          set status = 'ready',
              copy_id = (select id from public.copies where book_id = holds.book_id limit 1),
              ready_at = placed_at,
              pickup_ends_at = placed_at + interval '24 hours'
        where id = $1`,
      [first.id],
    );

    const holds = await holdsOf(ana);

    assert.deepEqual(
      holds.map((hold) => [hold.bookTitle, hold.status]),
      [
        ["Third Held", "waiting"],
        ["First Held", "ready"],
        ["Second Held", "cancelled"],
      ],
    );
    assert.deepEqual(holds[0], third);
    assert.deepEqual(holds[0]?.bookAuthors, ["Reyes, Ana"]);
  });

  it("cancelling takes the Member out of the queue and keeps everyone else's place", async () => {
    h.api().clock.set("2026-11-21T08:00:00.000Z");
    const bookId = await h.addBook("Queue Shrinks");
    const anas = await place(ana, bookId);
    h.api().clock.advance({ minutes: 1 });
    await place(ben, bookId);
    assert.deepEqual(await queueOf(bookId), [ana.member.id, ben.member.id]);

    const response = await cancel(ana, anas.id);

    assert.equal(response.status, 200);
    const { hold } = (await response.json()) as CancelHoldResponse;
    assert.equal(hold.status, "cancelled");
    assert.equal(hold.id, anas.id);
    assert.deepEqual(await queueOf(bookId), [ben.member.id]);
    assert.equal((await holdsOf(ana)).find((held) => held.id === anas.id)?.status, "cancelled");
  });

  it("lets a Member place a new Hold on a Book after cancelling the old one", async () => {
    const bookId = await h.addBook("Changed My Mind");
    const old = await place(ana, bookId);
    await cancel(ana, old.id);

    const again = await h.send("POST", "/holds", ana.accessToken, { bookId });

    assert.equal(again.status, 201);
    assert.equal((await holdsOf(ana)).filter((hold) => hold.bookId === bookId && hold.status === "waiting").length, 1);
  });

  it("refuses to cancel a Hold twice, or one that is fulfilled or expired", async () => {
    const bookId = await h.addBook("Cancel Once");
    const hold = await place(ana, bookId);
    assert.equal((await cancel(ana, hold.id)).status, 200);

    const twice = await cancel(ana, hold.id);
    assert.equal(twice.status, 409);
    assert.equal((await twice.json()).error.code, "hold_not_cancellable");

    for (const status of ["fulfilled", "expired"]) {
      const other = await h.addBook(`Not Cancellable ${status}`);
      const placed = await place(ana, other);
      await h.api().db.query(
        `update public.holds
            set status = $2::public.hold_status,
                fulfilled_at = case when $2 = 'fulfilled' then placed_at end,
                expired_at = case when $2 = 'expired' then placed_at end
          where id = $1`,
        [placed.id, status],
      );
      const refused = await cancel(ana, placed.id);
      assert.equal(refused.status, 409, status);
      assert.equal((await refused.json()).error.code, "hold_not_cancellable");
    }
  });

  it("answers 404 for a Hold that does not exist or belongs to someone else, and 400 for a bad id", async () => {
    const bookId = await h.addBook("Not Yours To Cancel");
    const bens = await place(ben, bookId);

    const theirs = await cancel(ana, bens.id);
    assert.equal(theirs.status, 404);
    assert.equal((await theirs.json()).error.code, "hold_not_found");
    assert.equal((await cancel(ana, randomUUID())).status, 404);
    assert.equal((await cancel(ana, "not-a-uuid")).status, 400);
    assert.deepEqual(await queueOf(bookId), [ben.member.id]);
  });

  it("shows a Member only their own Holds", async () => {
    const bookId = await h.addBook("Private Queue");
    const anas = await place(ana, bookId);
    const bens = await place(ben, bookId);

    assert.deepEqual((await holdsOf(ana)).filter((hold) => hold.bookId === bookId).map((hold) => hold.id), [anas.id]);
    assert.deepEqual((await holdsOf(ben)).filter((hold) => hold.bookId === bookId).map((hold) => hold.id), [bens.id]);
  });

  it("lets PostgreSQL itself refuse one Member another Member's Holds", async () => {
    const bookId = await h.addBook("Row Level Security");
    const anas = await place(ana, bookId);
    const bens = await place(ben, bookId);

    const asAna = (await (await h.send("GET", `/test/hold-rows/${bookId}`, ana.accessToken)).json()).rows;
    const asBen = (await (await h.send("GET", `/test/hold-rows/${bookId}`, ben.accessToken)).json()).rows;

    assert.deepEqual(asAna, [{ id: anas.id, member_id: ana.member.id }]);
    assert.deepEqual(asBen, [{ id: bens.id, member_id: ben.member.id }]);
  });

  it("does not let a Member write Holds straight to the database", async () => {
    const bookId = await h.addBook("Write Attempts");
    const bens = await place(ben, bookId);
    const outcomes = await withIdentity(h.api().db, { userId: ana.member.id, email: ana.email }, async (scope) => {
      const attempts: string[] = [];
      for (const sql of [
        `update public.holds set status = 'cancelled', cancelled_at = now() where id = '${bens.id}'`,
        "delete from public.holds",
        `insert into public.holds (book_id, member_id, placed_at, weight_hours, score) values ('${bookId}', '${ana.member.id}', now(), 0, now())`,
      ]) {
        await scope.query("savepoint attempt");
        try {
          await scope.query(sql);
          attempts.push("allowed");
        } catch {
          attempts.push("refused");
        }
        await scope.query("rollback to savepoint attempt");
      }
      return attempts;
    });

    assert.deepEqual(outcomes, ["refused", "refused", "refused"]);
  });

  it("records what the dispatcher needs: arrival time, weight, score and sequence", async () => {
    h.api().clock.set("2026-11-22T10:00:00.000Z");
    const bookId = await h.addBook("Ready For Dispatch");
    const anas = await place(ana, bookId);
    h.api().clock.advance({ seconds: 1 });
    const bens = await place(ben, bookId);

    const { rows } = await h.api().db.query(
      "select id, placed_at, weight_hours, score, seq::int as seq from public.holds where book_id = $1 order by seq",
      [bookId],
    );

    assert.deepEqual(rows.map((row) => row.id), [anas.id, bens.id]);
    assert.equal(rows[0].placed_at.toISOString(), "2026-11-22T10:00:00.000Z");
    assert.equal(rows[0].weight_hours, 0);
    assert.equal(rows[0].score.toISOString(), "2026-11-22T10:00:00.000Z");
    assert.ok(rows[1].seq > rows[0].seq);
  });
});

describe("Hold priority weights", () => {
  it("weights Faculty 24 hours and NTP / Employee 12 hours ahead of their arrival, and a UMAK Student 0", () => {
    const arrival = new Date("2026-11-22T10:00:00.000Z");
    assert.equal(holdScore(arrival, "faculty").toISOString(), "2026-11-21T10:00:00.000Z");
    assert.equal(holdScore(arrival, "ntp_employee").toISOString(), "2026-11-21T22:00:00.000Z");
    assert.equal(holdScore(arrival, "umak_student").toISOString(), "2026-11-22T10:00:00.000Z");
    assert.deepEqual([HOLD_WEIGHT_HOURS.faculty, HOLD_WEIGHT_HOURS.ntp_employee, HOLD_WEIGHT_HOURS.umak_student], [24, 12, 0]);
  });

  it("serves a Faculty Hold ahead of a UMAK Student Hold placed up to 24 hours earlier, but not later than that", () => {
    const student = new Date("2026-11-22T10:00:00.000Z");
    const facultyWithin = new Date(student.getTime() + 23 * 3_600_000);
    const facultyBeyond = new Date(student.getTime() + 25 * 3_600_000);
    assert.ok(holdScore(facultyWithin, "faculty") < holdScore(student, "umak_student"));
    assert.ok(holdScore(facultyBeyond, "faculty") > holdScore(student, "umak_student"));
  });
});
