import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pushDestination, pushTokenSchema } from "../src/index.ts";

describe("pushDestination", () => {
  it("opens My Books on Holds for a ready Hold, on Loans for a Loan, and the Announcement for an Announcement", () => {
    assert.deepEqual(pushDestination({ kind: "holdReady" }), { screen: "myBooks", segment: "holds" });
    assert.deepEqual(pushDestination({ kind: "loanDueTomorrow" }), { screen: "myBooks", segment: "loans" });
    assert.deepEqual(pushDestination({ kind: "loanOverdue" }), { screen: "myBooks", segment: "loans" });
    assert.deepEqual(pushDestination({ kind: "announcement" }), { screen: "announcement" });
  });

  it("opens nothing for data it does not know", () => {
    assert.equal(pushDestination(undefined), undefined);
    assert.equal(pushDestination(null), undefined);
    assert.equal(pushDestination("holdReady"), undefined);
    assert.equal(pushDestination({ kind: "somethingElse" }), undefined);
    assert.equal(pushDestination({}), undefined);
  });
});

describe("pushTokenSchema", () => {
  it("takes Expo push tokens and nothing else", () => {
    assert.ok(pushTokenSchema.safeParse("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]").success);
    assert.ok(pushTokenSchema.safeParse("ExpoPushToken[AbC-12_x]").success);
    assert.ok(!pushTokenSchema.safeParse("ExponentPushToken[]").success);
    assert.ok(!pushTokenSchema.safeParse("fcm-device-token").success);
    assert.ok(!pushTokenSchema.safeParse("ExponentPushToken[a b]").success);
  });
});
