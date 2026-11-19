import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { refusal } from "./loans-harness.ts";
import type { TestCopy } from "./loans-harness.ts";
import { newToken, pushHarness } from "./push-harness.ts";

describe("Push notification switches and phones", () => {
  const h = pushHarness();

  before(() => h.start());
  after(() => h.stop());

  it("starts a new Member with Hold ready, Loan due tomorrow and Loan overdue on, and Announcements off", async () => {
    const member = await createTestMember(h.api(), { firstName: "Paz", lastName: "Push" });

    assert.deepEqual(await h.settingsOf(member), { holdReady: true, loanDueTomorrow: true, loanOverdue: true, announcement: false });
  });

  it("saves each switch on its own and keeps the others", async () => {
    const member = await createTestMember(h.api(), { firstName: "Paz", lastName: "Push" });

    assert.deepEqual(await h.change(member, { announcement: true }), {
      holdReady: true,
      loanDueTomorrow: true,
      loanOverdue: true,
      announcement: true,
    });
    await h.change(member, { holdReady: false, loanOverdue: false });

    assert.deepEqual(await h.settingsOf(member), { holdReady: false, loanDueTomorrow: true, loanOverdue: false, announcement: true });
  });

  it("refuses a change that names no switch, an unknown one or a value that is not true or false", async () => {
    const member = await createTestMember(h.api(), { firstName: "Paz", lastName: "Push" });

    for (const body of [{}, { holdReady: "yes" }, { sound: true }]) {
      const response = await h.changeRequest(member, body);
      assert.equal((await refusal(response)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(await h.settingsOf(member), { holdReady: true, loanDueTomorrow: true, loanOverdue: true, announcement: false });
  });

  it("refuses a phone token that is not an Expo push token", async () => {
    const member = await createTestMember(h.api(), { firstName: "Paz", lastName: "Push" });

    const response = await h.registerRequest(member, "not-a-token");

    assert.equal((await refusal(response)).status, 400);
  });

  it("asks for a session", async () => {
    for (const [method, path, body] of [
      ["GET", "/members/me/push-settings", undefined],
      ["PATCH", "/members/me/push-settings", { holdReady: false }],
      ["PUT", "/members/me/push-device", { token: newToken() }],
    ] as const) {
      const response = await h.send(method, path, null, body);
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});

describe("Push notification when a Hold is ready", () => {
  const h = pushHarness();
  const { holdBecomesReady } = h;

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
    h.api().pushes.clear();
    h.api().pushes.failing = false;
  });

  it("pushes once to each phone of the Member, saying until when the Copy is set aside, and opens Holds when tapped", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    const phone = await h.register(ben);
    const tablet = await h.register(ben);
    const someoneElse = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
    const someoneElsesPhone = await h.register(someoneElse);

    await holdBecomesReady(ben, "Pushed To Ben");

    for (const token of [phone, tablet]) {
      assert.deepEqual(h.pushesTo(token), [
        {
          to: token,
          title: "Your Hold is ready",
          body: '"Pushed To Ben" is set aside for you at the library desk until Nov 13, 2026, 1:00 PM.',
          data: { kind: "holdReady" },
        },
      ]);
    }
    assert.deepEqual(h.pushesTo(someoneElsesPhone), []);
  });

  it("pushes nothing to a Member who switched it off, and still emails them", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    const phone = await h.register(ben);
    await h.change(ben, { holdReady: false });

    await holdBecomesReady(ben, "Not Pushed");

    assert.deepEqual(h.pushesTo(phone), []);
    assert.equal(h.api().emails.lastTo(ben.email)?.subject, "Your LIBRAS Hold is ready for pickup");
  });

  it("pushes nothing to a Member with no phone registered", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });

    await holdBecomesReady(ben, "No Phone");

    assert.deepEqual(h.api().pushes.sent, []);
  });

  it("still makes the Hold ready and emails the Member when the push service is down", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    await h.register(ben);
    h.api().pushes.failing = true;

    const { book, returned } = await holdBecomesReady(ben, "Push Service Down");

    assert.equal(returned.heldFor?.memberName, "Ben Cruz");
    assert.equal((await h.holdOn(ben, book.id)).status, "ready");
    assert.equal(h.api().emails.lastTo(ben.email)?.subject, "Your LIBRAS Hold is ready for pickup");
    await h.assertConsistent(book.id);
  });

  it("forgets a phone the push service says is no longer registered, and keeps pushing to the others", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    const gone = await h.register(ben);
    const kept = await h.register(ben);
    h.api().pushes.refuseNow(gone);

    await holdBecomesReady(ben, "First Ready");
    await holdBecomesReady(ben, "Second Ready");

    assert.equal(h.api().pushes.attemptsTo(gone), 1);
    assert.deepEqual(
      h.pushesTo(kept).map((push) => push.body),
      [
        '"First Ready" is set aside for you at the library desk until Nov 13, 2026, 1:00 PM.',
        '"Second Ready" is set aside for you at the library desk until Nov 13, 2026, 4:00 PM.',
      ],
    );
  });

  it("moves a phone to the Member who signs in on it next", async () => {
    const ben = await createTestMember(h.api(), { firstName: "Ben", lastName: "Cruz" });
    const carla = await createTestMember(h.api(), { firstName: "Carla", lastName: "Diaz" });
    const shared = await h.register(ben);
    await h.register(carla, shared);

    await holdBecomesReady(ben, "Ben's Hold");
    await holdBecomesReady(carla, "Carla's Hold");

    assert.deepEqual(
      h.pushesTo(shared).map((push) => push.body),
      ['"Carla\'s Hold" is set aside for you at the library desk until Nov 13, 2026, 4:00 PM.'],
    );
  });
});

describe("Push notifications alongside Loan notices", () => {
  const h = pushHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila: a 7-day Loan lent now is due at the end of 19 Nov.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
    h.api().pushes.clear();
    h.api().pushes.failing = false;
    h.api().emails.failing = false;
  });

  /** A new Member with a phone and one Copy of each title out, lent at the clock's time. */
  const memberWithLoans = async (titles: string[]) => {
    const member = await createTestMember(h.api(), { firstName: "Nina", lastName: "Notice" });
    const phone = await h.register(member);
    const deskSession = await h.deskSessionFor(member, h.lita());
    for (const title of titles) {
      const book = await h.addBook(title);
      const response = await h.lendWith(h.lita(), deskSession, (book.copies[0] as TestCopy).barcode);
      assert.equal(response.status, 201, await response.clone().text());
    }
    await h.endDeskSession(h.lita(), deskSession);
    return { member, phone };
  };

  /** Ticks the sweep at this library time ("2026-11-18 08:00"). */
  const tickAt = async (manila: string) => {
    h.at(manila);
    await h.api().sweep();
  };

  const noticeEmailsTo = (member: TestMember) => h.api().emails.sent.filter((email) => email.to === member.email && / LIBRAS Loans?\b/.test(email.subject));

  it("pushes the day before a Loan is due, with the email, once however often the sweep runs", async () => {
    const { member, phone } = await memberWithLoans(["Due Thursday"]);
    const second = await h.register(member);

    await tickAt("2026-11-18 07:59");
    assert.deepEqual(h.pushesTo(phone), []);
    await Promise.all([tickAt("2026-11-18 08:00"), h.api().sweep()]);
    await tickAt("2026-11-18 08:01");
    await tickAt("2026-11-18 20:00");

    for (const token of [phone, second]) {
      assert.deepEqual(h.pushesTo(token), [
        { to: token, title: "Your Loan is due tomorrow", body: '"Due Thursday" is due tomorrow, Nov 19, 2026.', data: { kind: "loanDueTomorrow" } },
      ]);
    }
    assert.equal(noticeEmailsTo(member).length, 1);
  });

  it("pushes on the first overdue day only, not with the weekly still-overdue emails, and covers every Loan in one push", async () => {
    const { member, phone } = await memberWithLoans(["Late One", "Late Two"]);
    await h.change(member, { loanDueTomorrow: false });

    for (const day of ["2026-11-18", "2026-11-20", "2026-11-21", "2026-11-27", "2026-12-04"]) await tickAt(`${day} 08:00`);

    assert.deepEqual(h.pushesTo(phone), [
      {
        to: phone,
        title: "Your Loans are overdue",
        body: '"Late One" and "Late Two" are overdue. Please return them to the library desk.',
        data: { kind: "loanOverdue" },
      },
    ]);
    // Due tomorrow, now overdue, then two still-overdue emails: the switches never stop an email.
    assert.equal(noticeEmailsTo(member).length, 4);
  });

  it("words the overdue push of one Loan with its due date", async () => {
    const { phone } = await memberWithLoans(["Only Late"]);

    await tickAt("2026-11-20 08:00");

    assert.deepEqual(
      h.pushesTo(phone).map(({ title, body }) => ({ title, body })),
      [{ title: "Your Loan is overdue", body: '"Only Late" was due on Nov 19, 2026. Please return it to the library desk.' }],
    );
  });

  it("pushes nothing for a kind the Member switched off, and still emails", async () => {
    const { member, phone } = await memberWithLoans(["Quiet Loan"]);
    await h.change(member, { loanDueTomorrow: false, loanOverdue: false });

    await tickAt("2026-11-18 08:00");
    await tickAt("2026-11-20 08:00");

    assert.deepEqual(h.pushesTo(phone), []);
    assert.deepEqual(
      noticeEmailsTo(member).map((email) => email.subject),
      ["Your LIBRAS Loan is due tomorrow", "You have an overdue LIBRAS Loan"],
    );
  });

  it("still emails, and records the notice, when the push service is down", async () => {
    const { member, phone } = await memberWithLoans(["Push Down"]);
    h.api().pushes.failing = true;

    await tickAt("2026-11-18 08:00");
    h.api().pushes.failing = false;
    await tickAt("2026-11-18 09:00");

    assert.deepEqual(noticeEmailsTo(member).map((email) => email.subject), ["Your LIBRAS Loan is due tomorrow"]);
    // A push that failed is not sent again: the event is recorded before the push leaves.
    assert.deepEqual(h.pushesTo(phone), []);
  });

  it("pushes nothing when the email could not be sent, and both go out together on the next tick", async () => {
    const { member, phone } = await memberWithLoans(["Email Down"]);
    h.api().emails.failing = true;

    await tickAt("2026-11-18 08:00");
    assert.deepEqual(h.pushesTo(phone), []);
    h.api().emails.failing = false;
    await tickAt("2026-11-18 08:01");

    assert.equal(noticeEmailsTo(member).length, 1);
    assert.equal(h.pushesTo(phone).length, 1);
  });
});

describe("Push notification when an Announcement starts", () => {
  const h = pushHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 2092, where no other test keeps an Announcement.
    h.api().clock.set("2092-03-10T09:00:00+08:00");
    h.api().pushes.clear();
  });

  it("pushes the running Announcement once to each phone of the Members who switched it on, from its start", async () => {
    const on = await createTestMember(h.api(), { firstName: "Ona", lastName: "Listens" });
    await h.change(on, { announcement: true });
    const onPhone = await h.register(on);
    const onTablet = await h.register(on);
    const off = await createTestMember(h.api(), { firstName: "Offa", lastName: "Default" });
    const offPhone = await h.register(off);
    await h.addAnnouncement("Library Week 2092", "2092-03-11T00:00:00+08:00", "2092-03-14T00:00:00+08:00");

    await h.api().sweep();
    assert.deepEqual(h.pushesTo(onPhone), []);
    h.api().clock.set("2092-03-11T00:00:00+08:00");
    await Promise.all([h.api().sweep(), h.api().sweep()]);
    await h.api().sweep();

    for (const token of [onPhone, onTablet]) {
      assert.deepEqual(h.pushesTo(token), [
        { to: token, title: "New from the library", body: "Library Week 2092", data: { kind: "announcement" } },
      ]);
    }
    assert.deepEqual(h.pushesTo(offPhone), []);

    // Switched on while it runs, a Member hears about it on the next tick.
    await h.change(off, { announcement: true });
    await h.api().sweep();
    assert.deepEqual(
      h.pushesTo(offPhone).map((push) => push.body),
      ["Library Week 2092"],
    );
  });

  it("pushes nothing once the Announcement has ended", async () => {
    const member = await createTestMember(h.api(), { firstName: "Ona", lastName: "Late" });
    await h.change(member, { announcement: true });
    const phone = await h.register(member);
    await h.addAnnouncement("Already Over", "2092-03-01T00:00:00+08:00", "2092-03-05T00:00:00+08:00");

    await h.api().sweep();

    assert.deepEqual(h.pushesTo(phone), []);
  });
});

describe("Phones that stop getting push notifications", () => {
  const h = pushHarness();

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().pushes.clear();
    h.api().pushes.failing = false;
    h.api().emails.clear();
  });

  it("forgets the phone at sign-out, and the Member is still emailed", async () => {
    const member = await createTestMember(h.api(), { firstName: "Sig", lastName: "Out" });
    const phone = await h.register(member);
    const other = await h.register(member);

    await h.holdBecomesReady(member, "Signed Out Before Ready", async () => {
      const response = await h.send("POST", "/auth/sign-out", member.accessToken, { pushToken: phone });
      assert.equal(response.status, 204);
    });

    assert.equal(h.api().pushes.attemptsTo(phone), 0);
    assert.equal(h.pushesTo(other).length, 1);
    assert.equal(h.api().emails.lastTo(member.email)?.subject, "Your LIBRAS Hold is ready for pickup");
  });

  it("forgets the phone at sign-out even when the session has already ended", async () => {
    const member = await createTestMember(h.api(), { firstName: "Sig", lastName: "Late" });
    const phone = await h.register(member);

    await h.holdBecomesReady(member, "Session Gone", async () => {
      assert.equal((await h.send("POST", "/auth/sign-out", member.accessToken)).status, 204);
      assert.equal((await h.send("POST", "/auth/sign-out", null, { pushToken: phone })).status, 204);
    });

    assert.equal(h.api().pushes.attemptsTo(phone), 0);
  });

  it("still signs out when the push token in the body is not valid", async () => {
    const member = await createTestMember(h.api(), { firstName: "Sig", lastName: "Odd" });

    const response = await h.send("POST", "/auth/sign-out", member.accessToken, { pushToken: "not-a-token" });

    assert.equal(response.status, 204);
    assert.equal((await h.send("GET", "/members/me", member.accessToken)).status, 401);
  });

  it("forgets every phone of the Member at Sign out of all devices", async () => {
    const member = await createTestMember(h.api(), { firstName: "All", lastName: "Devices" });
    const phones = [await h.register(member), await h.register(member)];

    await h.holdBecomesReady(member, "Everyone Signed Out", async () => {
      assert.equal((await h.send("POST", "/members/me/sign-out-all", member.accessToken)).status, 204);
    });

    for (const phone of phones) assert.equal(h.api().pushes.attemptsTo(phone), 0);
  });

  it("forgets every phone of the Member when they delete their account", async () => {
    h.api().clock.set("2093-05-10T09:00:00+08:00");
    const member = await createTestMember(h.api(), { firstName: "Del", lastName: "Eted" });
    await h.change(member, { announcement: true });
    const phone = await h.register(member);

    const deleted = await h.send("POST", "/members/me/delete", member.accessToken, { password: member.password });
    assert.equal(deleted.status, 204, await deleted.clone().text());
    await h.addAnnouncement("After The Deletion", "2093-05-10T00:00:00+08:00", "2093-05-12T00:00:00+08:00");
    await h.api().sweep();

    assert.equal(h.api().pushes.attemptsTo(phone), 0);
  });

  it("forgets a phone whose push receipt says it is no longer registered, once the receipt is due", async () => {
    const member = await createTestMember(h.api(), { firstName: "Rec", lastName: "Eipt" });
    const gone = await h.register(member);
    const kept = await h.register(member);
    h.api().pushes.refuseInReceipts(gone);

    await h.holdBecomesReady(member, "Receipt Says Gone");
    assert.equal(h.pushesTo(gone).length, 1);
    h.api().clock.advance({ minutes: 10 });
    await h.api().sweep();
    h.api().clock.advance({ minutes: 6 });
    await h.api().sweep();
    await h.holdBecomesReady(member, "After The Receipt");

    assert.equal(h.api().pushes.attemptsTo(gone), 1);
    assert.equal(h.pushesTo(kept).length, 2);
  });

  it("reads the receipts on a later tick when the push service could not answer", async () => {
    const member = await createTestMember(h.api(), { firstName: "Rec", lastName: "Later" });
    const gone = await h.register(member);
    h.api().pushes.refuseInReceipts(gone);
    await h.holdBecomesReady(member, "Receipts Down");
    h.api().clock.advance({ minutes: 20 });

    h.api().pushes.failing = true;
    await h.api().sweep();
    h.api().pushes.failing = false;
    await h.api().sweep();
    await h.holdBecomesReady(member, "Receipts Back");

    assert.equal(h.api().pushes.attemptsTo(gone), 1);
  });
});
