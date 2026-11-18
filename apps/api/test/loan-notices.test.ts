import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import type { Loan } from "@libras/shared";
import { createTestMember, createTestMemberOfType, startTestApi } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { dispatchHarness, pause, started } from "./dispatch-harness.ts";
import { eventually } from "./eventually.ts";
import type { CopyStatus, TestBook, TestCopy } from "./loans-harness.ts";

const SECRET = "test-sweep-secret-0123456789abcdef0123456789";

/** The Loan notice emails to this Member among these, leaving out sign-up codes and Hold-ready emails. */
const noticesTo = <T extends { to: string; subject: string }>(member: TestMember, emails: readonly T[]) =>
  emails.filter((email) => email.to === member.email && / LIBRAS Loans?\b/.test(email.subject));

/** What every group of Loan notice tests does: lend at a known time, tick the sweep at a library time, read the emails. */
function noticeHarness() {
  const h = dispatchHarness();

  /** A new Member with one Copy of each title out, all lent in one visit to the desk at the clock's time. */
  const memberWithLoans = async (titles: string[], member?: TestMember) => {
    const loanMember = member ?? (await createTestMember(h.api(), { firstName: "Nina", lastName: "Notice" }));
    const books: TestBook[] = [];
    const deskSession = await h.deskSessionFor(loanMember, h.lita());
    for (const title of titles) {
      const book = await h.addBook(title, Array<CopyStatus>(1).fill("available"));
      const response = await h.lendWith(h.lita(), deskSession, (book.copies[0] as TestCopy).barcode);
      assert.equal(response.status, 201, await response.clone().text());
      books.push(book);
    }
    await h.endDeskSession(h.lita(), deskSession);
    return { member: loanMember, books, loans: await h.loansOf(loanMember) };
  };

  /** Sets the clock to this library time ("2026-11-18 08:00"). */
  const at = (manila: string) => h.api().clock.set(`${manila.replace(" ", "T")}:00.000+08:00`);

  /** One tick of the sweep at this library time, with the emails it sent to the Member. */
  const tickAt = async (manila: string, member: TestMember) => {
    at(manila);
    const before = h.api().emails.sent.length;
    await h.api().sweep();
    return noticesTo(member, h.api().emails.sent.slice(before));
  };

  return { ...h, memberWithLoans, at, tickAt };
}

describe("Loan notices", () => {
  const h = noticeHarness();
  const { memberWithLoans, tickAt } = h;

  before(() => h.start());
  after(() => h.stop());

  beforeEach(() => {
    // 12 Nov 2026, 10:00 in Manila: a 7-day Loan lent now is due at the end of 19 Nov.
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  it("emails a due-tomorrow notice on the day before the due date, from 08:00 library time and not before", async () => {
    const { member, loans } = await memberWithLoans(["Due On Thursday"]);
    assert.equal((loans[0] as Loan).dueAt, "2026-11-19T15:59:59.999Z");

    assert.deepEqual(await tickAt("2026-11-17 08:00", member), []);
    assert.deepEqual(await tickAt("2026-11-18 07:59", member), []);

    const sent = await tickAt("2026-11-18 08:00", member);

    assert.equal(sent.length, 1);
    const email = sent[0];
    assert.equal(email?.subject, "Your LIBRAS Loan is due tomorrow");
    assert.match(email?.text ?? "", /^Hi Nina,/);
    assert.match(email?.text ?? "", /"Due On Thursday" \(Copy LT-[^)]+\) is due tomorrow, Nov 19, 2026\./);
  });

  it("sends the three kinds on their library days: due tomorrow, now overdue, then still overdue every 7 days, 4 times", async () => {
    const { member } = await memberWithLoans(["Never Returned"]);

    const days: string[] = [];
    const subjects: string[] = [];
    for (let day = 12; day <= 12 + 60; day += 1) {
      const date = new Date(Date.UTC(2026, 10, day)).toISOString().slice(0, 10);
      for (const time of ["07:59", "08:00", "13:00", "23:59"]) {
        for (const email of await tickAt(`${date} ${time}`, member)) {
          days.push(`${date} ${time}`);
          subjects.push(email.subject);
        }
      }
    }

    assert.deepEqual(days, [
      "2026-11-18 08:00",
      "2026-11-20 08:00",
      "2026-11-27 08:00",
      "2026-12-04 08:00",
      "2026-12-11 08:00",
      "2026-12-18 08:00",
    ]);
    assert.deepEqual(subjects, [
      "Your LIBRAS Loan is due tomorrow",
      ...Array<string>(5).fill("You have an overdue LIBRAS Loan"),
    ]);
  });

  it("says in the overdue notices since when the Loan is overdue, and the Fine so far", async () => {
    const { member } = await memberWithLoans(["Late Book"]);

    const first = await tickAt("2026-11-20 08:00", member);
    const second = await tickAt("2026-11-27 08:00", member);

    assert.match(
      first[0]?.text ?? "",
      /"Late Book" \(Copy [^)]+\) is overdue: it was due on Nov 19, 2026, 1 day ago\.\nThe Fine so far is PHP 5\.\nPlease return it to the library desk\./,
    );
    assert.match(
      second[0]?.text ?? "",
      /"Late Book" \(Copy [^)]+\) is still overdue: it was due on Nov 19, 2026, 8 days ago\.\nThe Fine so far is PHP 40\.\nPlease return it to the library desk\./,
    );
  });

  it("covers every Loan of a Member that needs a notice in one email a day, and each Member gets their own", async () => {
    h.at("2026-11-11 10:00");
    const { member: nina } = await memberWithLoans(["First Of Three", "Second Of Three"]);
    h.at("2026-11-13 10:00");
    await memberWithLoans(["Due A Day Later"], nina);
    const { member: omar } = await memberWithLoans(["Omar's Book"]);
    // Nina's first two are due on 18 Nov, so overdue from 19 Nov; her third is due on 20 Nov, and so is Omar's.

    const ninas = await tickAt("2026-11-19 08:00", nina);
    const omars = noticesTo(omar, h.api().emails.sent);

    assert.equal(ninas.length, 1);
    assert.equal(ninas[0]?.subject, "You have overdue LIBRAS Loans");
    const text = ninas[0]?.text ?? "";
    // Overdue Loans first, then the one due tomorrow, with whether it can be renewed: not while the others are overdue.
    assert.match(
      text,
      /"First Of Three" [^\n]* is overdue[\s\S]*"Second Of Three" [^\n]* is overdue[\s\S]*"Due A Day Later" [^\n]* is due tomorrow, Nov 20, 2026\.\nIt cannot be renewed: You have another Loan that is overdue\./,
    );
    assert.equal(omars.length, 1);
    assert.equal(omars[0]?.subject, "Your LIBRAS Loan is due tomorrow");
    assert.doesNotMatch(omars[0]?.text ?? "", /Of Three/);
  });

  it("says in the due-tomorrow notice that the Loan can be renewed, to what date, and the daily Fine rate", async () => {
    const { member } = await memberWithLoans(["Can Be Renewed"]);

    const [email] = await tickAt("2026-11-18 08:00", member);

    assert.match(
      email?.text ?? "",
      /is due tomorrow, Nov 19, 2026\.\nYou can renew it in the LIBRAS app, under My Loans, until then: the new due date would be Nov 26, 2026\.\nIf it is returned late, the Fine is PHP 5 a day, up to PHP 300\./,
    );
  });

  it("says in the due-tomorrow notice why the Loan cannot be renewed: another Member is waiting for the Book", async () => {
    const { member, books } = await memberWithLoans(["Wanted By Others"]);
    const other = await createTestMember(h.api(), { firstName: "Omar", lastName: "Other" });
    await h.placeHold(other, (books[0] as TestBook).id);

    const [email] = await tickAt("2026-11-18 08:00", member);

    assert.match(
      email?.text ?? "",
      /is due tomorrow, Nov 19, 2026\.\nIt cannot be renewed: Another Member is waiting for this Book, so it cannot be renewed\. Please return it to the library desk by then\./,
    );
  });

  it("says in the due-tomorrow notice why the Loan cannot be renewed: the Member has an unsettled Fine", async () => {
    // Lent on 9 Nov, due the end of 16 Nov, returned a day late: a Fine nobody has settled.
    h.at("2026-11-09 10:00");
    const { member, books } = await memberWithLoans(["Back A Day Late"]);
    h.at("2026-11-12 10:00");
    await memberWithLoans(["Due On Thursday Too"], member);
    h.at("2026-11-17 10:00");
    await h.giveBack(((books[0] as TestBook).copies[0] as TestCopy).barcode);

    const [email] = await tickAt("2026-11-18 08:00", member);

    assert.match(
      email?.text ?? "",
      /is due tomorrow, Nov 19, 2026\.\nIt cannot be renewed: You have an unsettled Fine\. Renewals can be made again once it is settled at the library desk\. Please return it to the library desk by then\./,
    );
  });

  it("gives a renewed Loan a fresh set of notices for its new due date, and says it cannot be renewed again", async () => {
    const { member, loans } = await memberWithLoans(["Renewed After The Notice"]);
    assert.equal((await tickAt("2026-11-18 08:00", member)).length, 1);
    const renewed = await h.send("POST", `/loans/${(loans[0] as Loan).id}/renew`, member.accessToken);
    assert.equal(renewed.status, 200);

    // The old due date passes with no overdue notice; the new one, 26 Nov, gets its own due-tomorrow notice.
    assert.deepEqual(await tickAt("2026-11-20 08:00", member), []);
    assert.deepEqual(await tickAt("2026-11-24 08:00", member), []);
    const [email] = await tickAt("2026-11-25 08:00", member);

    assert.match(email?.text ?? "", /is due tomorrow, Nov 26, 2026\.\nIt cannot be renewed: Already renewed\. It cannot be renewed again\./);
    assert.equal((await tickAt("2026-11-27 08:00", member))[0]?.subject, "You have an overdue LIBRAS Loan");
  });

  it("sends nothing for a Loan once its Copy is returned", async () => {
    const { member, books } = await memberWithLoans(["Returned Early"]);
    await h.giveBack(((books[0] as TestBook).copies[0] as TestCopy).barcode);

    for (const day of ["2026-11-18 08:00", "2026-11-20 08:00", "2026-11-27 08:00"]) assert.deepEqual(await tickAt(day, member), [], day);
  });

  it("stops the notices of a Loan returned while overdue", async () => {
    const { member, books } = await memberWithLoans(["Returned Late"]);
    assert.equal((await tickAt("2026-11-20 08:00", member)).length, 1);
    h.at("2026-11-21 10:00");
    await h.giveBack(((books[0] as TestBook).copies[0] as TestCopy).barcode);

    assert.deepEqual(await tickAt("2026-11-27 08:00", member), []);
  });

  it("does not send the same notice twice when the sweep ticks again", async () => {
    const { member } = await memberWithLoans(["Ticked Often"]);

    assert.equal((await tickAt("2026-11-18 08:00", member)).length, 1);
    assert.deepEqual(await tickAt("2026-11-18 08:05", member), []);
    assert.deepEqual(await tickAt("2026-11-19 08:00", member), []);
  });

  it("writes no record when the email is refused, and sends the notice on the next tick", async () => {
    const { member } = await memberWithLoans(["Provider Down"]);
    h.api().emails.failing = true;
    try {
      assert.deepEqual(await tickAt("2026-11-18 08:00", member), []);
    } finally {
      h.api().emails.failing = false;
    }

    const retried = await tickAt("2026-11-18 08:05", member);

    assert.equal(retried.length, 1);
    assert.match(retried[0]?.text ?? "", /Provider Down/);
    assert.deepEqual(await tickAt("2026-11-18 08:10", member), []);
  });

  it("does not send again that day when the email's outcome is unknown, and sends the notice on the next day's run", async () => {
    const { member } = await memberWithLoans(["Answered Too Late"]);
    // The provider accepts the email but answers after the sender gave up waiting.
    h.api().emails.answeringLate = true;
    try {
      const first = await tickAt("2026-11-20 08:00", member);
      assert.equal(first.length, 1, "the email did reach the Member");
      for (const time of ["2026-11-20 08:05", "2026-11-20 12:00", "2026-11-20 23:59"]) {
        assert.deepEqual(await tickAt(time, member), [], `${time}: no second email the same day`);
      }
    } finally {
      h.api().emails.answeringLate = false;
    }

    const nextDay = await tickAt("2026-11-21 08:00", member);

    assert.equal(nextDay.length, 1, "the notice is still due, and goes out once the next day");
    assert.match(nextDay[0]?.text ?? "", /Answered Too Late/);
    assert.deepEqual(await tickAt("2026-11-21 08:05", member), []);
  });

  it("skips a due-tomorrow notice that is out of date: the first tick after the due date sends only the overdue one", async () => {
    const { member } = await memberWithLoans(["Missed The Day Before"]);

    const sent = await tickAt("2026-11-20 09:30", member);

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.subject, "You have an overdue LIBRAS Loan");
    assert.doesNotMatch(sent[0]?.text ?? "", /due tomorrow/);
    assert.deepEqual(await tickAt("2026-11-20 10:00", member), []);
  });

  it("sends a missed repeat once, not once for each week missed, and the next one on its own day", async () => {
    const { member } = await memberWithLoans(["Weeks Without A Tick"]);

    // 5 Dec: the now-overdue notice (20 Nov) and the first repeat (27 Nov) were missed; the second (4 Dec) is due.
    const missed = await tickAt("2026-12-05 08:00", member);
    assert.equal(missed.length, 1);
    assert.match(missed[0]?.text ?? "", /is still overdue: it was due on Nov 19, 2026, 16 days ago\./);
    for (const day of ["2026-12-06 08:00", "2026-12-10 23:59"]) assert.deepEqual(await tickAt(day, member), [], day);

    assert.equal((await tickAt("2026-12-11 08:00", member)).length, 1);
  });

  it("sends nothing after the fourth repeat, however late the first tick comes", async () => {
    const { member } = await memberWithLoans(["Long Forgotten"]);

    assert.equal((await tickAt("2026-12-24 07:59", member)).length, 1, "the fourth repeat's week (18 to 24 Dec) is still on");
    assert.deepEqual(await tickAt("2026-12-25 08:00", member), []);
    assert.deepEqual(await tickAt("2027-02-01 08:00", member), []);
  });

  it("sends a Member at most one email a day: a notice that comes due after it waits for the next day", async () => {
    await h.api().db.query("update public.loan_policies set loan_period_days = 1 where account_type = 'faculty'");
    try {
      const member = await createTestMemberOfType(h.api(), "faculty");
      // A 1-day Loan from 17 Nov is due at the end of 18 Nov, so its due-tomorrow notice is due on 17 Nov.
      h.at("2026-11-17 07:00");
      await memberWithLoans(["Short Loan Early"], member);
      assert.equal((await tickAt("2026-11-17 08:00", member)).length, 1);

      // Lent later the same day, due at the end of 18 Nov as well: its notice waits until 18 Nov, the due day.
      h.at("2026-11-17 15:00");
      await memberWithLoans(["Short Loan Late"], member);
      assert.deepEqual(await tickAt("2026-11-17 15:05", member), []);

      const [email] = await tickAt("2026-11-18 08:00", member);
      assert.equal(email?.subject, "Your LIBRAS Loan is due today");
      assert.match(email?.text ?? "", /"Short Loan Late" \(Copy [^)]+\) is due today, Nov 18, 2026\./);
      assert.doesNotMatch(email?.text ?? "", /Short Loan Early/);
    } finally {
      await h.api().db.query("update public.loan_policies set loan_period_days = 7 where account_type = 'faculty'");
    }
  });
});

describe("Loan notices at the same moment", () => {
  const h = noticeHarness();
  const { memberWithLoans } = h;

  before(() => h.start());
  after(() => h.stop());
  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });

  it("sends each notice once when two ticks overlap, the second waiting while the first's email is in flight", async () => {
    const { member } = await memberWithLoans(["Two Ticks"]);
    h.at("2026-11-18 08:00");

    // The first tick's email is in flight with its record not yet written; the second tick starts meanwhile.
    const release = h.api().emails.hold();
    const ticks = await (async () => {
      try {
        const first = started(h.api().sweep());
        await pause(400);
        const second = started(h.api().sweep());
        await pause(400);
        assert.deepEqual([first.answered, second.answered], [false, false], "the second tick waits for the first");
        return [first, second];
      } finally {
        release();
      }
    })();

    await Promise.all(ticks.map((tick) => tick.response));
    assert.equal(noticesTo(member, h.api().emails.sent).length, 1);
  });

  it("sends the notice on the second tick when the first tick's email is refused while the second waits", async () => {
    const { member } = await memberWithLoans(["First Tick Refused"]);
    h.at("2026-11-18 08:00");

    // Only the first send fails: the provider recovers before the second.
    let sends = 0;
    const realSend = h.api().emails.send.bind(h.api().emails);
    h.api().emails.send = async (message) => {
      sends += 1;
      if (sends === 1) {
        await pause(400);
        throw new Error("The provider is down");
      }
      return realSend(message);
    };
    try {
      const first = started(h.api().sweep());
      await pause(150);
      const second = started(h.api().sweep());
      await Promise.all([first.response, second.response]);
    } finally {
      h.api().emails.send = realSend;
    }

    assert.equal(noticesTo(member, h.api().emails.sent).length, 1);
  });
});

describe("The sweep tick runs the Loan notices beside the Pickup Window expiry", () => {
  const h = noticeHarness();
  const { memberWithLoans } = h;

  /** A Member with a Loan due tomorrow and a ready Hold whose window has ended, at 18 Nov 09:00. */
  const bothJobsDue = async () => {
    const { member } = await memberWithLoans(["Notice Due"]);
    h.at("2026-11-17 08:00");
    const lender = await createTestMember(h.api(), { firstName: "Lena", lastName: "Lender" });
    const book = await h.lentBook("Window Ends", lender);
    await h.placeHold(member, book.id);
    await h.giveBack((book.copies[0] as TestCopy).barcode);
    h.at("2026-11-18 09:00");
    const holdStatus = async () =>
      (await h.api().db.query<{ status: string }>("select status from public.holds where book_id = $1", [book.id])).rows[0]?.status;
    return { member, holdStatus };
  };
  const sentTo = (member: TestMember) => noticesTo(member, h.api().emails.sent);

  before(() => h.start({ sweepSecret: SECRET }));
  after(() => h.stop());
  beforeEach(() => {
    h.api().clock.set("2026-11-12T02:00:00.000Z");
    h.api().emails.clear();
  });
  afterEach(async () => {
    h.api().clock.advance({ days: 365 });
    await h.api().sweepPickupWindows();
  });

  it("runs both jobs on the database schedule's call and says what each did", async () => {
    const { member, holdStatus } = await bothJobsDue();

    const response = await h.send("POST", "/internal/sweeps/pickup-expiry", SECRET);

    assert.equal(response.status, 200);
    const body = (await response.json()) as { expired: number; noticeEmails: number };
    assert.ok(body.expired >= 1 && body.noticeEmails >= 1, JSON.stringify(body));
    assert.equal(await holdStatus(), "expired");
    assert.equal(sentTo(member).length, 1);
  });

  it("still sends the Loan notices when the Pickup Window expiry fails", async () => {
    const { member, holdStatus } = await bothJobsDue();
    await h.api().db.query("alter table public.holds rename column pickup_ends_at to pickup_ends_at_away");
    try {
      await h.api().sweep();
    } finally {
      await h.api().db.query("alter table public.holds rename column pickup_ends_at_away to pickup_ends_at");
    }

    assert.equal(await holdStatus(), "ready");
    assert.equal(sentTo(member).length, 1);
  });

  it("still ends the Pickup Windows when the Loan notices fail", async () => {
    const { member, holdStatus } = await bothJobsDue();
    await h.api().db.query("alter table public.loan_notice_emails rename to loan_notice_emails_away");
    try {
      await h.api().sweep();
    } finally {
      await h.api().db.query("alter table public.loan_notice_emails_away rename to loan_notice_emails");
    }

    assert.equal(await holdStatus(), "expired");
    assert.equal(sentTo(member).length, 0);
  });

  it("sends the Loan notices on the API's own timer, with nobody calling it", async () => {
    // A second API with the real timer, on the same database, at 18 Nov 09:00 in Manila.
    const api = await startTestApi({ sweepIntervalMs: 50 });
    api.clock.set("2026-11-18T01:00:00.000Z");
    try {
      const { member } = await bothJobsDue();

      const sent = await eventually(
        async () => noticesTo(member, api.emails.sent).length,
        (count) => count > 0,
        5_000,
      );

      assert.equal(sent, 1);
    } finally {
      await api.close();
    }
  });
});
