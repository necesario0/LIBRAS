import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bellLabel, notificationAge, notificationDestination, notificationsQuerySchema, unreadBadgeText } from "../src/index.ts";

describe("unreadBadgeText", () => {
  it("shows no badge at zero, the count up to nine, then 9+", () => {
    assert.equal(unreadBadgeText(0), undefined);
    assert.equal(unreadBadgeText(-1), undefined);
    assert.equal(unreadBadgeText(1), "1");
    assert.equal(unreadBadgeText(9), "9");
    assert.equal(unreadBadgeText(10), "9+");
    assert.equal(unreadBadgeText(250), "9+");
  });
});

describe("bellLabel", () => {
  it("names the bell, with the unread count when there is one", () => {
    assert.equal(bellLabel(0), "Notifications");
    assert.equal(bellLabel(12), "Notifications, 12 unread");
  });
});

describe("notificationDestination", () => {
  it("opens the screen a tap on the same push notification opens", () => {
    assert.deepEqual(notificationDestination({ kind: "holdReady" }), { screen: "myBooks", segment: "holds" });
    assert.deepEqual(notificationDestination({ kind: "loanDueTomorrow" }), { screen: "myBooks", segment: "loans" });
    assert.deepEqual(notificationDestination({ kind: "loanOverdue" }), { screen: "myBooks", segment: "loans" });
    assert.deepEqual(notificationDestination({ kind: "announcement" }), { screen: "announcement" });
  });
});

describe("notificationAge", () => {
  // 20 Nov 2026, 10:00 in Manila.
  const now = new Date("2026-11-20T02:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  it("says Just now for the first minute, and for a time a little ahead of the phone's clock", () => {
    assert.equal(notificationAge(ago(0), now), "Just now");
    assert.equal(notificationAge(ago(59_999), now), "Just now");
    assert.equal(notificationAge(ago(-5 * MINUTE), now), "Just now");
  });

  it("counts minutes, then hours, for the first day", () => {
    assert.equal(notificationAge(ago(MINUTE), now), "1 minute ago");
    assert.equal(notificationAge(ago(59 * MINUTE), now), "59 minutes ago");
    assert.equal(notificationAge(ago(HOUR), now), "1 hour ago");
    assert.equal(notificationAge(ago(23 * HOUR + 59 * MINUTE), now), "23 hours ago");
  });

  it("counts library days after that, then gives the date from a week back", () => {
    // 19 Nov, 09:00 in Manila: more than a day ago, the day before.
    assert.equal(notificationAge("2026-11-19T01:00:00.000Z", now), "Yesterday");
    // 18 Nov, 23:30 in Manila (15:30 UTC): two library days back, though less than two days ago.
    assert.equal(notificationAge("2026-11-18T15:30:00.000Z", now), "2 days ago");
    assert.equal(notificationAge("2026-11-14T02:00:00.000Z", now), "6 days ago");
    assert.equal(notificationAge("2026-11-13T02:00:00.000Z", now), "Nov 13, 2026");
  });
});

describe("notificationsQuerySchema", () => {
  it("takes no cursor or one cursor, and nothing else", () => {
    assert.ok(notificationsQuerySchema.safeParse({}).success);
    assert.ok(notificationsQuerySchema.safeParse({ before: "abc" }).success);
    assert.ok(!notificationsQuerySchema.safeParse({ before: "" }).success);
    assert.ok(!notificationsQuerySchema.safeParse({ before: ["a", "b"] }).success);
    assert.ok(!notificationsQuerySchema.safeParse({ page: "2" }).success);
  });
});
