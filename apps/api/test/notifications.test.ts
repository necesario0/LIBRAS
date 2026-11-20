import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { NOTIFICATIONS_PAGE_SIZE } from "@libras/shared";
import type { MemberNotification, MyNotificationsResponse, NotificationKind, NotificationsUnreadResponse } from "@libras/shared";
import { withIdentity } from "../src/auth/identity.ts";
import { announceDispatch } from "../src/holds/dispatch.ts";
import { createTestMember, createTestMemberFromSignUp, visitorSignUpBody } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { capturingLogger } from "./failing-audit-writes.ts";
import { refusal } from "./loans-harness.ts";
import type { TestCopy } from "./loans-harness.ts";
import { pushHarness } from "./push-harness.ts";

/** The inbox tests: the API over HTTP, on the test clock, with the push harness's ways to make events happen. */
function notificationsHarness() {
  const h = pushHarness();

  const inboxRequest = (member: TestMember, before?: string) =>
    h.send("GET", `/members/me/notifications${before === undefined ? "" : `?before=${encodeURIComponent(before)}`}`, member.accessToken);
  const inboxPage = async (member: TestMember, before?: string) => {
    const response = await inboxRequest(member, before);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as MyNotificationsResponse;
  };
  /** Every Notification of the Member, all pages read. */
  const inbox = async (member: TestMember) => {
    const all: MemberNotification[] = [];
    let before: string | undefined;
    do {
      const page = await inboxPage(member, before);
      all.push(...page.notifications);
      before = page.nextCursor ?? undefined;
    } while (before !== undefined);
    return all;
  };
  const ofKind = async (member: TestMember, kind: NotificationKind) => (await inbox(member)).filter((entry) => entry.kind === kind);
  const unread = async (member: TestMember) => {
    const response = await h.send("GET", "/members/me/notifications/unread", member.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as NotificationsUnreadResponse).unread;
  };
  const markRequest = (member: TestMember, id: string) => h.send("POST", `/members/me/notifications/${id}/read`, member.accessToken);
  const mark = async (member: TestMember, id: string) => {
    const response = await markRequest(member, id);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as NotificationsUnreadResponse).unread;
  };
  const markAll = async (member: TestMember) => {
    const response = await h.send("POST", "/members/me/notifications/read-all", member.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as NotificationsUnreadResponse).unread;
  };

  /** A new Member with one Copy of each title out, lent at the clock's time (with a phone when asked). */
  const memberWithLoans = async (titles: string[], { phone = false } = {}) => {
    const member = await createTestMember(h.api(), { firstName: "Nina", lastName: "Notice" });
    const token = phone ? await h.register(member) : undefined;
    const deskSession = await h.deskSessionFor(member, h.lita());
    const loanIds: string[] = [];
    for (const title of titles) {
      const book = await h.addBook(title);
      const response = await h.lendWith(h.lita(), deskSession, (book.copies[0] as TestCopy).barcode);
      assert.equal(response.status, 201, await response.clone().text());
      loanIds.push(((await response.json()) as { loan: { id: string } }).loan.id);
    }
    await h.endDeskSession(h.lita(), deskSession);
    return { member, token, loanIds };
  };

  /** Ticks the sweep at this library time ("2026-11-18 08:00"). */
  const tickAt = async (manila: string) => {
    h.at(manila);
    await h.api().sweep();
  };

  return { ...h, inboxRequest, inboxPage, inbox, ofKind, unread, markRequest, mark, markAll, memberWithLoans, tickAt };
}

describe("Notification when a Hold is ready", () => {
  const h = notificationsHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
    h.api().pushes.clear();
  });

  it("adds one unread Notification with the push's words, the time and the Hold, for the Member only", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    const someoneElse = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });

    const { book } = await h.holdBecomesReady(ben, "Ready For Ben");
    const hold = await h.holdOn(ben, book.id);

    const entries = await h.ofKind(ben, "holdReady");
    assert.deepEqual(entries, [
      {
        id: entries[0]?.id,
        kind: "holdReady",
        title: "Your Hold is ready",
        body: '"Ready For Ben" is set aside for you at the library desk until Nov 13, 2026, 1:00 PM.',
        at: "2026-11-12T05:00:00.000Z",
        read: false,
        about: { kind: "hold", holdId: hold.id },
      },
    ]);
    assert.deepEqual(await h.ofKind(someoneElse, "holdReady"), []);
  });

  it("adds it when the Member switched the push off, and when they have no phone", async () => {
    const off = await createTestMember(h.api(), { firstName: "Offa", lastName: "Switch" });
    const offPhone = await h.register(off);
    await h.change(off, { holdReady: false });
    const noPhone = await createTestMember(h.api(), { firstName: "Nora", lastName: "Phoneless" });

    await h.holdBecomesReady(off, "Switched Off");
    await h.holdBecomesReady(noPhone, "No Phone At All");

    assert.deepEqual(h.pushesTo(offPhone), []);
    assert.deepEqual(
      (await h.ofKind(off, "holdReady")).map((entry) => entry.body),
      ['"Switched Off" is set aside for you at the library desk until Nov 13, 2026, 1:00 PM.'],
    );
    assert.equal((await h.ofKind(noPhone, "holdReady")).length, 1);
  });

  it("adds none when the same dispatch is announced again, or twice at once", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Again" });
    const phone = await h.register(ben);
    const { book } = await h.holdBecomesReady(ben, "Announced Twice");
    const hold = await h.holdOn(ben, book.id);
    const api = h.api();
    const deps = { db: api.db, clock: api.clock, email: api.emails, push: api.pushes, logger: capturingLogger() };
    const dispatch = {
      holdId: hold.id,
      memberId: ben.member.id,
      memberName: "Ben Again",
      memberEmail: ben.email,
      bookTitle: "Announced Twice",
      accessionNumber: (book.copies[0] as TestCopy).accessionNumber,
      pickupEndsAt: new Date("2026-11-13T05:00:00.000Z"),
    };

    await Promise.all([announceDispatch(deps, dispatch), announceDispatch(deps, dispatch)]);
    await announceDispatch(deps, dispatch);

    assert.equal((await h.ofKind(ben, "holdReady")).length, 1);
    assert.equal(h.pushesTo(phone).length, 1);
    assert.deepEqual(deps.logger.errors, []);
  });
});

describe("Notifications alongside Loan notices", () => {
  const h = notificationsHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila: a 7-day Loan lent now is due at the end of 19 Nov.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
    h.api().pushes.clear();
  });

  it("adds one Notification per Loan due tomorrow, with the email, however often and however concurrently the sweep runs", async () => {
    const { member, loanIds } = await h.memberWithLoans(["Due One", "Due Two"]);

    await h.tickAt("2026-11-18 07:59");
    assert.deepEqual(await h.ofKind(member, "loanDueTomorrow"), []);
    await Promise.all([h.tickAt("2026-11-18 08:00"), h.api().sweep(), h.api().sweep()]);
    await h.tickAt("2026-11-18 08:01");
    await h.tickAt("2026-11-18 20:00");

    const entries = await h.ofKind(member, "loanDueTomorrow");
    assert.deepEqual(
      entries.map(({ title, body, about, read }) => ({ title, body, about, read })).sort((a, b) => a.body.localeCompare(b.body)),
      [
        { title: "Your Loan is due tomorrow", body: '"Due One" is due tomorrow, Nov 19, 2026.', about: { kind: "loan", loanId: loanIds[0] }, read: false },
        { title: "Your Loan is due tomorrow", body: '"Due Two" is due tomorrow, Nov 19, 2026.', about: { kind: "loan", loanId: loanIds[1] }, read: false },
      ],
    );
    assert.ok(entries.every((entry) => entry.at === "2026-11-18T00:00:00.000Z"));
  });

  it("adds one Notification per Loan on its first overdue day only, not with the weekly still-overdue emails", async () => {
    const { member, loanIds } = await h.memberWithLoans(["Late One"]);

    for (const day of ["2026-11-18", "2026-11-20", "2026-11-21", "2026-11-27", "2026-12-04"]) await h.tickAt(`${day} 08:00`);

    assert.deepEqual(
      (await h.ofKind(member, "loanOverdue")).map(({ title, body, about }) => ({ title, body, about })),
      [{ title: "Your Loan is overdue", body: '"Late One" was due on Nov 19, 2026. Please return it to the library desk.', about: { kind: "loan", loanId: loanIds[0] } }],
    );
    assert.equal((await h.ofKind(member, "loanDueTomorrow")).length, 1);
  });

  it("adds them when the Member switched both pushes off", async () => {
    const { member, token } = await h.memberWithLoans(["Quiet Loan"], { phone: true });
    await h.change(member, { loanDueTomorrow: false, loanOverdue: false });

    await h.tickAt("2026-11-18 08:00");
    await h.tickAt("2026-11-20 08:00");

    assert.deepEqual(h.pushesTo(token as string), []);
    assert.equal((await h.ofKind(member, "loanDueTomorrow")).length, 1);
    assert.equal((await h.ofKind(member, "loanOverdue")).length, 1);
  });

  it("adds a new Notification for a Renewal's new due date", async () => {
    const { member, loanIds } = await h.memberWithLoans(["Renewed Loan"]);
    await h.tickAt("2026-11-18 08:00");
    const renewed = await h.send("POST", `/loans/${loanIds[0]}/renew`, member.accessToken);
    assert.equal(renewed.status, 200, await renewed.clone().text());

    await h.tickAt("2026-11-25 08:00");

    assert.deepEqual(
      (await h.ofKind(member, "loanDueTomorrow")).map((entry) => entry.body),
      ['"Renewed Loan" is due tomorrow, Nov 26, 2026.', '"Renewed Loan" is due tomorrow, Nov 19, 2026.'],
    );
  });

  it("adds none when the email could not be sent, and adds it with the email on the next tick", async () => {
    const { member } = await h.memberWithLoans(["Email Down"]);
    h.api().emails.failing = true;

    try {
      await h.tickAt("2026-11-18 08:00");
      assert.deepEqual(await h.ofKind(member, "loanDueTomorrow"), []);
    } finally {
      h.api().emails.failing = false;
    }
    await h.tickAt("2026-11-18 08:01");

    assert.equal((await h.ofKind(member, "loanDueTomorrow")).length, 1);
  });
});

describe("Notification of an Announcement", () => {
  const h = notificationsHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 2094, where no other test keeps an Announcement.
    h.api().clock.set("2094-03-10T09:00:00+08:00");
  });

  it("is in every Member's inbox once from its start, also with the push switch off, and for a Visitor", async () => {
    const off = await createTestMember(h.api(), { firstName: "Offa", lastName: "Default" });
    const on = await createTestMember(h.api(), { firstName: "Ona", lastName: "Listens" });
    await h.change(on, { announcement: true });
    await h.register(on);
    const visitor = await createTestMemberFromSignUp(h.api(), visitorSignUpBody());
    const id = await h.addAnnouncement("Library Week 2094", "2094-03-11T00:00:00+08:00", "2094-03-14T00:00:00+08:00");

    assert.deepEqual(await h.inbox(off), []);
    assert.equal(await h.unread(off), 0);
    h.api().clock.set("2094-03-11T00:00:00+08:00");
    await Promise.all([h.api().sweep(), h.api().sweep()]);
    await h.api().sweep();

    for (const member of [off, on, visitor]) {
      assert.deepEqual(await h.inbox(member), [
        {
          id,
          kind: "announcement",
          title: "New from the library",
          body: "Library Week 2094",
          at: "2094-03-10T16:00:00.000Z",
          read: false,
          about: { kind: "announcement", announcementId: id },
        },
      ]);
      assert.equal(await h.unread(member), 1);
    }
    // It stays in the inbox once it has ended.
    h.api().clock.set("2094-03-20T09:00:00+08:00");
    assert.equal((await h.inbox(off)).length, 1);
  });

  it("is not in the inbox of a Member who joined after it ended, and is for one who joined while it ran", async () => {
    h.api().clock.set("2094-04-01T09:00:00+08:00");
    const before = await createTestMember(h.api(), { firstName: "Bea", lastName: "Early" });
    await h.addAnnouncement("Early April 2094", "2094-04-01T00:00:00+08:00", "2094-04-03T00:00:00+08:00");
    h.api().clock.set("2094-04-02T09:00:00+08:00");
    const during = await createTestMember(h.api(), { firstName: "Dan", lastName: "During" });
    h.api().clock.set("2094-04-05T09:00:00+08:00");
    const afterwards = await createTestMember(h.api(), { firstName: "Al", lastName: "After" });

    assert.equal((await h.inbox(before)).length, 1);
    assert.equal((await h.inbox(during)).length, 1);
    assert.deepEqual(await h.inbox(afterwards), []);
  });
});

describe("Listing and marking Notifications", () => {
  const h = notificationsHarness();

  before(() => h.start());
  after(() => h.stop());

  let bookId: string | undefined;

  /**
   * Inserts a Hold Notification for the Member straight into the table, at this time, about a
   * cancelled Hold of theirs (the events themselves have their own tests above).
   */
  const addOwn = async (member: TestMember, at: string, title = "Your Hold is ready") => {
    bookId ??= (await h.addBook("Inbox Listing Book")).id;
    const hold = await h.api().db.query<{ id: string }>(
      `insert into public.holds (book_id, member_id, status, placed_at, weight_hours, score, cancelled_at)
       values ($1, $2, 'cancelled', $3, 0, $3, $3)
       returning id`,
      [bookId, member.member.id, at],
    );
    const holdId = hold.rows[0]?.id;
    assert.ok(holdId);
    const { rows } = await h.api().db.query<{ id: string }>(
      `insert into public.notifications (member_id, kind, occasion, title, body, hold_id, created_at)
       values ($1, 'hold_ready', $2, $3, 'A line.', $4, $5) returning id`,
      [member.member.id, holdId, title, holdId, at],
    );
    return rows[0]?.id as string;
  };

  it("lists newest first, a page at a time, Hold and Loan Notifications and Announcements together", async () => {
    h.api().clock.set("2094-06-01T09:00:00+08:00");
    const member = await createTestMember(h.api(), { firstName: "Pia", lastName: "Pages" });
    const own: string[] = [];
    for (let index = 0; index < NOTIFICATIONS_PAGE_SIZE + 3; index += 1) {
      own.push(await addOwn(member, new Date(Date.parse("2094-06-02T01:00:00.000Z") + index * 3_600_000).toISOString()));
    }
    const early = await h.addAnnouncement("Early June 2094", "2094-06-02T00:00:00+08:00", "2094-06-03T00:00:00+08:00");
    const late = await h.addAnnouncement("Mid June 2094", "2094-06-10T00:00:00+08:00", "2094-06-12T00:00:00+08:00");
    h.api().clock.set("2094-06-20T09:00:00+08:00");

    const first = await h.inboxPage(member);
    assert.equal(first.notifications.length, NOTIFICATIONS_PAGE_SIZE);
    assert.equal(first.unread, NOTIFICATIONS_PAGE_SIZE + 5);
    assert.ok(first.nextCursor);
    const second = await h.inboxPage(member, first.nextCursor);
    assert.equal(second.nextCursor, null);

    const ids = [...first.notifications, ...second.notifications].map((entry) => entry.id);
    assert.deepEqual(ids, [late, ...[...own].reverse(), early]);
    const times = [...first.notifications, ...second.notifications].map((entry) => entry.at);
    assert.deepEqual(times, [...times].sort().reverse());
  });

  it("counts the unread ones, marks one read (again is harmless) and marks all read", async () => {
    h.api().clock.set("2094-07-01T09:00:00+08:00");
    const member = await createTestMember(h.api(), { firstName: "Mia", lastName: "Marks" });
    const hold = await addOwn(member, "2094-07-01T00:30:00.000Z");
    await addOwn(member, "2094-07-01T00:40:00.000Z");
    const announcement = await h.addAnnouncement("July 2094", "2094-07-01T00:00:00+08:00", "2094-07-03T00:00:00+08:00");
    assert.equal(await h.unread(member), 3);

    assert.equal(await h.mark(member, hold), 2);
    assert.equal(await h.mark(member, hold), 2);
    assert.equal(await h.mark(member, announcement), 1);
    assert.equal(await h.mark(member, announcement), 1);
    const listed = await h.inbox(member);
    assert.deepEqual(
      listed.map((entry) => entry.read),
      [false, true, true],
    );

    assert.equal(await h.markAll(member), 0);
    assert.equal(await h.unread(member), 0);
    assert.ok((await h.inbox(member)).every((entry) => entry.read));
    assert.equal(await h.markAll(member), 0);

    // A new one after Mark all as read is unread.
    await addOwn(member, "2094-07-01T01:00:00.000Z", "Later");
    assert.equal(await h.unread(member), 1);
    assert.equal((await h.inboxPage(member)).unread, 1);
  });

  it("refuses an id that is not one, a cursor the API did not make, and an id the Member has no Notification with", async () => {
    h.api().clock.set("2094-07-10T09:00:00+08:00");
    const member = await createTestMember(h.api(), { firstName: "Rex", lastName: "Fused" });

    assert.equal((await refusal(await h.markRequest(member, "not-an-id"))).status, 400);
    for (const cursor of ["nonsense", Buffer.from(JSON.stringify({ at: "yesterday", id: "x" })).toString("base64url")]) {
      assert.equal((await refusal(await h.inboxRequest(member, cursor))).status, 400, cursor);
    }
    const unknown = await refusal(await h.markRequest(member, randomUUID()));
    assert.deepEqual([unknown.status, unknown.code], [404, "notification_not_found"]);
    // An Announcement that has not started yet is not in the inbox either.
    const scheduled = await h.addAnnouncement("Late July 2094", "2094-07-28T00:00:00+08:00", "2094-07-29T00:00:00+08:00");
    assert.equal((await refusal(await h.markRequest(member, scheduled))).status, 404);
  });

  it("asks for a session", async () => {
    for (const [method, path] of [
      ["GET", "/members/me/notifications"],
      ["GET", "/members/me/notifications/unread"],
      ["POST", `/members/me/notifications/${randomUUID()}/read`],
      ["POST", "/members/me/notifications/read-all"],
    ] as const) {
      assert.equal((await h.send(method, path, null)).status, 401, `${method} ${path}`);
    }
  });

  it("keeps each Member to their own: another's cannot be read or marked, through the API", async () => {
    h.api().clock.set("2094-08-01T09:00:00+08:00");
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Own" });
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Other" });
    const anas = await addOwn(ana, "2094-08-01T00:10:00.000Z");
    const announcement = await h.addAnnouncement("Shared 2094", "2094-08-01T00:00:00+08:00", "2094-08-03T00:00:00+08:00");

    assert.ok(!(await h.inbox(ben)).some((entry) => entry.id === anas));
    const refused = await refusal(await h.markRequest(ben, anas));
    assert.deepEqual([refused.status, refused.code], [404, "notification_not_found"]);
    await h.markAll(ben);
    await h.mark(ben, announcement);

    assert.deepEqual(
      (await h.inbox(ana)).map(({ id, read }) => ({ id, read })),
      [
        { id: anas, read: false },
        { id: announcement, read: false },
      ],
    );
    assert.equal(await h.unread(ana), 2);
  });

  it("keeps each Member to their own in the database too, with row-level security", async () => {
    h.api().clock.set("2094-08-10T09:00:00+08:00");
    const ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Rows" });
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Rows" });
    const anas = await addOwn(ana, "2094-08-10T00:20:00.000Z");
    const announcement = await h.addAnnouncement("Rows 2094", "2094-08-10T00:00:00+08:00", "2094-08-12T00:00:00+08:00");
    await h.mark(ana, announcement);
    const asBen = <T>(work: Parameters<typeof withIdentity<T>>[2]) =>
      withIdentity(h.api().db, { userId: ben.member.id, email: ben.email }, work);

    const seen = await asBen(async (scope) => ({
      notifications: (await scope.query("select id from public.notifications where member_id = $1", [ana.member.id])).rowCount,
      reads: (await scope.query("select 1 from public.announcement_reads where member_id = $1", [ana.member.id])).rowCount,
      marked: (await scope.query("update public.notifications set read_at = now() where id = $1", [anas])).rowCount,
    }));
    assert.deepEqual(seen, { notifications: 0, reads: 0, marked: 0 });

    await assert.rejects(
      asBen((scope) => scope.query("insert into public.announcement_reads (member_id, announcement_id, read_at) values ($1, $2, now())", [ana.member.id, announcement])),
      /row-level security/,
    );
    await assert.rejects(
      asBen((scope) =>
        scope.query(
          "insert into public.notifications (member_id, kind, occasion, title, body, hold_id, created_at) values ($1, 'hold_ready', 'x', 't', 'b', $2, now())",
          [ben.member.id, randomUUID()],
        ),
      ),
      /permission denied/,
    );
    await assert.rejects(asBen((scope) => scope.query("delete from public.notifications where id = $1", [anas])), /permission denied/);
    await assert.rejects(asBen((scope) => scope.query("update public.notifications set title = 'changed' where id = $1", [anas])), /permission denied/);
    // Ben's own read mark is his to add.
    await asBen((scope) =>
      scope.query("insert into public.announcement_reads (member_id, announcement_id, read_at) values ($1, $2, now())", [ben.member.id, announcement]),
    );

    assert.deepEqual(
      (await h.inbox(ana)).map(({ id, read }) => ({ id, read })),
      [
        { id: anas, read: false },
        { id: announcement, read: true },
      ],
    );
  });

  it("removes the Member's Notifications and read marks with their account", async () => {
    h.api().clock.set("2094-08-20T09:00:00+08:00");
    const member = await createTestMember(h.api(), { firstName: "Del", lastName: "Inbox" });
    await addOwn(member, "2094-08-20T00:50:00.000Z");
    const announcement = await h.addAnnouncement("Before Deleting 2094", "2094-08-20T00:00:00+08:00", "2094-08-22T00:00:00+08:00");
    await h.mark(member, announcement);

    const deleted = await h.send("POST", "/members/me/delete", member.accessToken, { password: member.password });
    assert.equal(deleted.status, 204, await deleted.clone().text());

    const { rows } = await h.api().db.query(
      `select (select count(*)::int from public.notifications where member_id = $1) as notifications,
              (select count(*)::int from public.announcement_reads where member_id = $1) as reads`,
      [member.member.id],
    );
    assert.deepEqual(rows[0], { notifications: 0, reads: 0 });
  });
});

describe("A Notification that cannot be written", () => {
  const h = notificationsHarness();
  const logger = capturingLogger();
  let undo: (() => Promise<void>) | undefined;

  before(async () => {
    await h.start({ logger });
    const db = h.api().db;
    await db.query(
      `create or replace function public.libras_test_refuse_notifications() returns trigger language plpgsql as $$
         begin raise exception 'notification write refused for the test'; end $$`,
    );
    await db.query("drop trigger if exists libras_test_refuse_notifications on public.notifications");
    await db.query(
      `create trigger libras_test_refuse_notifications before insert on public.notifications
         for each row execute function public.libras_test_refuse_notifications()`,
    );
    undo = async () => {
      await db.query("drop trigger if exists libras_test_refuse_notifications on public.notifications");
      await db.query("drop function if exists public.libras_test_refuse_notifications()");
    };
  });
  after(async () => {
    try {
      await undo?.();
    } finally {
      await h.stop();
    }
  });

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
    h.api().pushes.clear();
    logger.errors.length = 0;
  });

  it("still makes the Hold ready, emails and pushes, and logs the failure", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Unwritten" });
    const phone = await h.register(ben);

    const { book, returned } = await h.holdBecomesReady(ben, "Inbox Down");

    assert.equal(returned.heldFor?.memberName, "Ben Unwritten");
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
    await h.assertConsistent(book.id);
    assert.equal(h.api().emails.lastTo(ben.email)?.subject, "Your LIBRAS Hold is ready for pickup");
    assert.equal(h.pushesTo(phone).length, 1);
    assert.deepEqual(await h.ofKind(ben, "holdReady"), []);
    assert.ok(logger.errors.some((error) => error.includes('The "holdReady" Notifications could not be recorded')));
  });

  it("still sends the Loan notice email and push, records the notice, and does not send them again", async () => {
    const { member, token } = await h.memberWithLoans(["Inbox Down Loan"], { phone: true });

    await h.tickAt("2026-11-18 08:00");
    await h.tickAt("2026-11-18 09:00");

    const notices = h.api().emails.sent.filter((email) => email.to === member.email && / LIBRAS Loans?\b/.test(email.subject));
    assert.deepEqual(notices.map((email) => email.subject), ["Your LIBRAS Loan is due tomorrow"]);
    assert.equal(h.pushesTo(token as string).length, 1);
    assert.deepEqual(await h.ofKind(member, "loanDueTomorrow"), []);
    assert.ok(logger.errors.some((error) => error.includes('The "loanDueTomorrow" Notifications could not be recorded')));
  });
});
