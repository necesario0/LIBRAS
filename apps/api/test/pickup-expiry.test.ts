import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createAuditLog } from "../src/audit/index.ts";
import type { AppDeps } from "../src/app.ts";
import { startPickupSweeper } from "../src/holds/sweeper.ts";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { dispatchHarness, pause, started } from "./dispatch-harness.ts";
import { eventually } from "./eventually.ts";
import { refusal } from "./loans-harness.ts";
import type { TestCopy } from "./loans-harness.ts";

describe("Pickup Window expiry", () => {
  const h = dispatchHarness();
  let ana: TestMember;
  let ben: TestMember;
  let carla: TestMember;

  before(async () => {
    await h.start();
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    carla = await createTestMember(h.api(), { firstName: "Carla", lastName: "Diaz" });
  });
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  // A test's ready Holds must not be swept by the next test: a year on, they have all ended.
  afterEach(async () => {
    h.api().clock.advance({ days: 365 });
    await h.api().sweepPickupWindows();
  });

  it("expires the Hold once its Pickup Window has passed and makes the Copy available when nobody waits", async () => {
    const book = await h.lentBook("Never Picked Up", ana);
    await h.placeHold(ben, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");

    h.api().clock.advance({ hours: 24 });
    assert.equal(await h.api().sweepPickupWindows(), 1);

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
    assert.equal(await h.availableCopies(carla, book.id), 1);
  });

  it("passes the Copy on to the next waiting Hold, with a Pickup Window of its own and its Member emailed", async () => {
    const book = await h.lentBook("Next In Line", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.placeHold(carla, book.id);
    await h.giveBack(copy.barcode);
    h.api().emails.clear();

    // Ben's window ends 24 hours after the return. The sweep runs 30 minutes late: Carla's window starts then.
    h.api().clock.advance({ hours: 24, minutes: 30 });
    assert.equal(await h.api().sweepPickupWindows(), 1);

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
    const next = await h.holdOn(carla, book.id);
    assert.equal(next.status, "ready");
    assert.equal(next.pickupEndsAt, "2026-11-14T02:30:00.000Z");
    assert.equal(h.api().emails.sent.length, 1);
    const email = h.api().emails.lastTo(carla.email);
    assert.equal(email?.subject, "Your LIBRAS Hold is ready for pickup");
    assert.match(email?.text ?? "", /until Nov 14, 2026, 10:30 AM/);
    // The Copy is Carla's to borrow now, and Ben cannot borrow it any more.
    assert.equal(await h.availableCopies(ana, book.id), 0);
    assert.equal((await refusal(await h.lendRequest(ben, copy.barcode))).code, "copy_set_aside");
    assert.equal((await h.lendRequest(carla, copy.barcode)).status, 201);
  });

  it("records the expiry and the resulting dispatch in the audit log, with no actor", async () => {
    const audit = createAuditLog(h.api());
    const book = await h.lentBook("Audited Expiry", ana);
    const copy = book.copies[0] as TestCopy;
    const bens = await h.placeHold(ben, book.id);
    const carlas = await h.placeHold(carla, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 25 });
    const before = (await audit.newest())?.seq ?? 0;

    await h.api().sweepPickupWindows();

    const entries = await audit.entries({ afterSeq: before });
    assert.deepEqual(
      entries.map((entry) => [entry.type, entry.actorId, entry.subject]),
      [
        ["hold_expired", null, bens.id],
        ["hold_dispatched", null, carlas.id],
      ],
    );
    assert.equal(entries[0]?.data.memberId, ben.member.id);
    assert.equal(entries[0]?.data.accessionNumber, copy.accessionNumber);
    assert.equal(entries[0]?.data.pickupEndsAt, "2026-11-13T02:00:00.000Z");
    assert.equal(entries[0]?.data.expiredAt, "2026-11-13T03:00:00.000Z");
    assert.equal(entries[1]?.data.cause, "pickup_window_expired");
    assert.equal(entries[1]?.data.pickupEndsAt, "2026-11-14T03:00:00.000Z");
    assert.equal((await audit.verify()).intact, true);
  });

  it("records only the expiry when no Hold was waiting", async () => {
    const audit = createAuditLog(h.api());
    const book = await h.lentBook("Audited Alone", ana);
    await h.placeHold(ben, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.api().clock.advance({ hours: 24 });
    const before = (await audit.newest())?.seq ?? 0;

    await h.api().sweepPickupWindows();

    assert.deepEqual((await audit.entries({ afterSeq: before })).map((entry) => entry.type), ["hold_expired"]);
    assert.equal(h.api().emails.sent.length, 1, "only the Hold-ready email of the return, none for the expiry");
  });

  it("leaves a Hold alone until its Pickup Window has ended, to the millisecond", async () => {
    const book = await h.lentBook("Not Yet", ana);
    await h.placeHold(ben, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);

    h.api().clock.advance({ hours: 24, milliseconds: -1 });
    assert.equal(await h.api().sweepPickupWindows(), 0);
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
    assert.equal(await h.availableCopies(carla, book.id), 0);

    h.api().clock.advance({ milliseconds: 1 });
    assert.equal(await h.api().sweepPickupWindows(), 1);
    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
  });

  it("does nothing for a Hold the Member already borrowed or cancelled, and expires each Hold only once", async () => {
    const borrowed = await h.lentBook("Borrowed In Time", ana);
    const cancelled = await h.lentBook("Cancelled In Time", ana);
    const missed = await h.lentBook("Missed", ana);
    for (const book of [borrowed, cancelled, missed]) await h.placeHold(ben, book.id);
    for (const book of [borrowed, cancelled, missed]) await h.giveBack((book.copies[0] as TestCopy).barcode);
    assert.equal((await h.lendRequest(ben, (borrowed.copies[0] as TestCopy).barcode)).status, 201);
    assert.equal((await h.cancelHold(ben, (await h.holdOn(ben, cancelled.id)).id)).status, 200);

    h.api().clock.advance({ days: 3 });
    assert.equal(await h.api().sweepPickupWindows(), 1);
    assert.equal(await h.api().sweepPickupWindows(), 0);

    assert.equal((await h.holdOn(ben, borrowed.id)).status, "fulfilled");
    assert.equal((await h.holdOn(ben, cancelled.id)).status, "cancelled");
    assert.equal((await h.holdOn(ben, missed.id)).status, "expired");
  });

});

describe("Pickup Window expiry without the sweep", () => {
  const h = dispatchHarness();
  let ana: TestMember;
  let ben: TestMember;
  let carla: TestMember;

  before(async () => {
    await h.start();
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    carla = await createTestMember(h.api(), { firstName: "Carla", lastName: "Diaz" });
  });
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });
  afterEach(async () => {
    h.api().clock.advance({ days: 365 });
    await h.api().sweepPickupWindows();
  });

  it("shows the Member the Hold as expired as soon as the window has ended, whenever the sweep last ran", async () => {
    const book = await h.lentBook("Seen Expired", ana);
    await h.placeHold(ben, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.api().clock.advance({ hours: 23, minutes: 59 });
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");

    h.api().clock.advance({ minutes: 1 });
    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
    assert.equal(await h.availableCopies(carla, book.id), 1);
  });

  it("starts the next Member's Pickup Window and emails them when the Member's own list is what finds the expiry", async () => {
    const book = await h.lentBook("Found By The List", ana);
    await h.placeHold(ben, book.id);
    await h.placeHold(carla, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.api().emails.clear();
    h.api().clock.advance({ hours: 24, minutes: 10 });

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");

    assert.equal((await h.holdOn(carla, book.id)).pickupEndsAt, "2026-11-14T02:10:00.000Z");
    assert.equal(h.api().emails.sent.length, 1);
  });

  it("does not lend the set-aside Copy to its Member once the window has ended, but to the next Member in line", async () => {
    const book = await h.lentBook("Too Late For Ben", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.placeHold(carla, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 24 });

    assert.equal((await refusal(await h.lendRequest(ben, copy.barcode))).code, "copy_set_aside");

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
    assert.equal((await h.holdOn(carla, book.id)).status, "ready");
    assert.equal((await h.lendRequest(carla, copy.barcode)).status, 201);
  });

  it("does not turn a Loan after the window into the Hold being fulfilled: the Hold expired, and the freed Copy is lent like any other", async () => {
    const book = await h.lentBook("Late But Free", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 24, seconds: 1 });

    assert.equal((await h.lendRequest(ben, copy.barcode)).status, 201);

    const hold = await h.holdOn(ben, book.id);
    assert.equal(hold.status, "expired");
    assert.equal((await h.loansOf(ben)).filter((loan) => loan.returnedAt === null).length, 1);
  });

  it("lends the Copy of an ended window to any Member when nobody is waiting", async () => {
    const book = await h.lentBook("Free For All", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 25 });

    assert.equal((await h.lendRequest(carla, copy.barcode)).status, 201);

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
  });

  it("refuses to cancel a Hold whose window has ended, because it has expired, and passes the Copy on once", async () => {
    const book = await h.lentBook("Cancelled Too Late", ana);
    await h.placeHold(ben, book.id);
    await h.placeHold(carla, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    const bens = (await h.holdOn(ben, book.id)).id;
    h.api().clock.advance({ hours: 24 });

    assert.equal((await refusal(await h.cancelHold(ben, bens))).code, "hold_not_cancellable");

    assert.equal((await h.holdOn(ben, book.id)).status, "expired");
    assert.equal((await h.holdOn(carla, book.id)).status, "ready");
    await h.assertConsistent(book.id);
  });

  it("still lends the set-aside Copy to its Member in the last moment of the window", async () => {
    const book = await h.lentBook("Just In Time", ana);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(ben, book.id);
    await h.giveBack(copy.barcode);
    h.api().clock.advance({ hours: 24, milliseconds: -1 });

    assert.equal((await h.lendRequest(ben, copy.barcode)).status, 201);

    assert.equal((await h.holdOn(ben, book.id)).status, "fulfilled");
  });
});

describe("Pickup Window expiry at the same moment", () => {
  const h = dispatchHarness();
  const { assertConsistent, whileAuditLogIsHeld } = h;
  let lender: TestMember;
  let holder: TestMember;
  let next: TestMember;

  /** A Book whose only Copy came back for \`holder\`, so the Copy is set aside, and whose window ended. */
  const expiredWindow = async (title: string, withNext: boolean) => {
    const book = await h.lentBook(title, lender);
    const copy = book.copies[0] as TestCopy;
    await h.placeHold(holder, book.id);
    if (withNext) await h.placeHold(next, book.id);
    await h.giveBack(copy.barcode);
    // Read before the window ends: reading the Hold after it would expire it.
    const holdId = (await h.holdOn(holder, book.id)).id;
    h.api().emails.clear();
    h.api().clock.advance({ hours: 24, seconds: 1 });
    return { book, copy, holdId };
  };
  const expiryEntries = async (afterSeq: number, bookId: string) =>
    (await createAuditLog(h.api()).entries({ afterSeq, limit: 1000 })).filter(
      (entry) => entry.type === "hold_expired" && entry.data.bookId === bookId,
    );
  const newestSeq = async () => (await createAuditLog(h.api()).newest())?.seq ?? 0;

  before(async () => {
    await h.start();
    lender = await createTestMember(h.api(), { firstName: "Lender", lastName: "Lopez" });
    holder = await createTestMember(h.api(), { firstName: "Holder", lastName: "Hernandez" });
    next = await createTestMember(h.api(), { firstName: "Next", lastName: "Navarro" });
  });
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });
  afterEach(async () => {
    h.api().clock.advance({ days: 365 });
    await h.api().sweepPickupWindows();
  });

  it("expires a Hold exactly once when two sweeps run at the same moment", async () => {
    const { book } = await expiredWindow("Swept Twice", true);
    const before = await newestSeq();

    const counts = await Promise.all([h.api().sweepPickupWindows(), h.api().sweepPickupWindows()]);

    assert.equal(
      counts.reduce((total, count) => total + count, 0),
      1,
    );
    assert.equal((await expiryEntries(before, book.id)).length, 1);
    assert.equal((await h.holdOn(next, book.id)).status, "ready");
    assert.equal(h.api().emails.sent.length, 1);
    await assertConsistent(book.id);
  });

  for (const withNext of [true, false]) {
    it(`gives the same outcome when the Member's Loan comes while the sweep is expiring the Hold (another Hold waiting: ${withNext})`, async () => {
      const { book, copy } = await expiredWindow(`Loan During The Sweep ${withNext}`, withNext);
      const before = await newestSeq();

      // The sweep has expired the Hold and placed the Copy, but has not committed.
      const { sweeping, lending } = await whileAuditLogIsHeld(async () => {
        const sweeping = started(h.api().sweepPickupWindows());
        await pause(400);
        const lending = started(h.lendRequest(holder, copy.barcode));
        await pause(400);
        assert.deepEqual([sweeping.answered, lending.answered], [false, false]);
        return { sweeping, lending };
      });

      assert.equal(await sweeping.response, 1);
      const response = await lending.response;
      assert.equal((await h.holdOn(holder, book.id)).status, "expired");
      assert.equal((await expiryEntries(before, book.id)).length, 1);
      if (withNext) {
        assert.equal((await refusal(response)).code, "copy_set_aside");
        assert.equal((await h.holdOn(next, book.id)).status, "ready");
      } else {
        assert.equal(response.status, 201);
      }
      await assertConsistent(book.id);
    });
  }

  it("refuses the cancel of a Hold that the sweep is expiring at that moment", async () => {
    const { book, holdId } = await expiredWindow("Cancel During The Sweep", true);

    const { sweeping, cancelling } = await whileAuditLogIsHeld(async () => {
      const sweeping = started(h.api().sweepPickupWindows());
      await pause(400);
      const cancelling = started(h.cancelHold(holder, holdId));
      await pause(400);
      assert.deepEqual([sweeping.answered, cancelling.answered], [false, false]);
      return { sweeping, cancelling };
    });

    assert.equal(await sweeping.response, 1);
    assert.equal((await refusal(await cancelling.response)).code, "hold_not_cancellable");
    assert.equal((await h.holdOn(holder, book.id)).status, "expired");
    assert.equal((await h.holdOn(next, book.id)).status, "ready");
    await assertConsistent(book.id);
  });

  for (const sweepFirst of [true, false]) {
    it(`gives a waiting Hold exactly one Copy when an expiry and a return of another Copy race for it (the sweep starts first: ${sweepFirst})`, async () => {
      const book = await h.addBook(`Expiry Against Return ${sweepFirst}`, ["available", "available"]);
      const [first, second] = book.copies as [TestCopy, TestCopy];
      await h.lend(lender, first.barcode);
      await h.lend(lender, second.barcode);
      await h.placeHold(holder, book.id);
      await h.giveBack(first.barcode);
      await h.placeHold(next, book.id);
      h.api().clock.advance({ hours: 24, seconds: 1 });

      const { sweeping, returning } = await whileAuditLogIsHeld(async () => {
        const sweep = () => started(h.api().sweepPickupWindows());
        const giveBack = () => started(h.giveBackRequest(second.barcode));
        const calls = sweepFirst ? { sweeping: sweep(), returning: undefined } : { sweeping: undefined, returning: giveBack() };
        await pause(400);
        const rest = sweepFirst ? { returning: giveBack() } : { sweeping: sweep() };
        await pause(400);
        return { ...calls, ...rest } as { sweeping: ReturnType<typeof sweep>; returning: ReturnType<typeof giveBack> };
      });

      assert.equal(await sweeping.response, 1);
      assert.equal((await returning.response).status, 200);
      assert.equal((await h.holdOn(holder, book.id)).status, "expired");
      assert.equal((await h.holdOn(next, book.id)).status, "ready");
      assert.equal(await h.availableCopies(lender, book.id), 1);
      assert.equal(h.api().emails.sent.filter((email) => email.to === next.email).length, 1);
      await assertConsistent(book.id);
    });
  }
});

describe("Pickup Window expiry on a timer", () => {
  const h = dispatchHarness();
  let lender: TestMember;
  let holder: TestMember;

  before(async () => {
    await h.start({ sweepIntervalMs: 50 });
    lender = await createTestMember(h.api(), { firstName: "Lender", lastName: "Lopez" });
    holder = await createTestMember(h.api(), { firstName: "Holder", lastName: "Hernandez" });
  });
  after(() => h.stop());

  it("expires the Hold by itself, with nobody opening the app or the desk page", async () => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const book = await h.lentBook("Expired By The Timer", lender);
    await h.placeHold(holder, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.api().clock.advance({ hours: 24 });

    // Read from the database: reading the Hold through the API would expire it, and this is about nobody reading it.
    const status = await eventually(
      async () => (await h.api().db.query<{ status: string }>("select status from public.holds where book_id = $1", [book.id])).rows[0]?.status,
      (value) => value === "expired",
      5_000,
    );

    assert.equal(status, "expired");
    assert.equal(await h.availableCopies(holder, book.id), 1);
  });

  it("keeps sweeping after a sweep failed", async () => {
    const logged: unknown[] = [];
    let queries = 0;
    const deps = {
      db: {
        query: () => {
          queries += 1;
          return queries === 1 ? Promise.reject(new Error("the database is restarting")) : Promise.resolve({ rows: [] });
        },
      },
      clock: h.api().clock,
      logger: { info: () => {}, error: (_message: string, error?: unknown) => logged.push(error) },
    };

    const sweeper = startPickupSweeper(deps as unknown as AppDeps, 20);
    try {
      await eventually(
        async () => queries,
        (count) => count >= 3,
        2_000,
      );
    } finally {
      sweeper.stop();
    }

    assert.ok(queries >= 3, "the sweep ran again after the first one failed");
    assert.equal(logged.length, 1);
  });

  it("does not start a sweep while the last one is still running, and stops when asked", async () => {
    let running = 0;
    let overlapped = false;
    let queries = 0;
    const deps = {
      db: {
        query: async () => {
          queries += 1;
          running += 1;
          overlapped ||= running > 1;
          await pause(80);
          running -= 1;
          return { rows: [] };
        },
      },
      clock: h.api().clock,
      logger: { info: () => {}, error: () => {} },
    };

    const sweeper = startPickupSweeper(deps as unknown as AppDeps, 10);
    await pause(400);
    sweeper.stop();
    await pause(200);
    const afterStop = queries;
    await pause(200);

    assert.equal(overlapped, false);
    assert.ok(afterStop >= 2);
    assert.equal(queries, afterStop, "no sweep starts after stop");
  });
});

describe("Pickup Window expiry on the database's schedule", () => {
  const SECRET = "test-sweep-secret-0123456789abcdef0123456789";
  const h = dispatchHarness();
  let lender: TestMember;
  let holder: TestMember;

  const endedWindow = async (title: string) => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    const book = await h.lentBook(title, lender);
    await h.placeHold(holder, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.api().clock.advance({ hours: 24 });
    // Read from the database: reading the Hold through the API would expire it.
    return async () => (await h.api().db.query<{ status: string }>("select status from public.holds where book_id = $1", [book.id])).rows[0]?.status;
  };
  const sweepRequest = (secret: string | null) => h.send("POST", "/internal/sweeps/pickup-expiry", secret);

  before(async () => {
    await h.start({ sweepSecret: SECRET });
    lender = await createTestMember(h.api(), { firstName: "Lender", lastName: "Lopez" });
    holder = await createTestMember(h.api(), { firstName: "Holder", lastName: "Hernandez" });
  });
  after(() => h.stop());

  it("expires every Hold whose window has ended when it is called with the shared secret, and says how many", async () => {
    const statusOf = await endedWindow("Expired By The Schedule");

    const response = await sweepRequest(SECRET);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { expired: 1 });
    assert.equal(await statusOf(), "expired");
    assert.deepEqual(await (await sweepRequest(SECRET)).json(), { expired: 0 });
  });

  it("answers 401 to a request without the secret or with a wrong one, and expires nothing", async () => {
    const statusOf = await endedWindow("Not Expired By Strangers");

    for (const secret of [null, "", "wrong", `${SECRET}x`, SECRET.slice(0, -1)]) {
      const response = await sweepRequest(secret);
      assert.equal(response.status, 401, String(secret));
      assert.equal((await response.json()).error.code, "invalid_sweep_secret");
    }

    assert.equal(await statusOf(), "ready");
    assert.equal((await sweepRequest(SECRET)).status, 200);
  });

  it("does not exist when no secret is configured", async () => {
    const api = await startTestApi();
    try {
      const response = await fetch(`${api.baseUrl}/internal/sweeps/pickup-expiry`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
      assert.equal(response.status, 404);
    } finally {
      await api.close();
    }
  });
});
