import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PushSettingsResponse } from "@libras/shared";
import { createTestAccount, createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { dispatchHarness } from "./dispatch-harness.ts";
import type { TestCopy } from "./loans-harness.ts";

let tokens = 0;
/** A new Expo push token, as a phone would get one. */
export const newToken = () => `ExponentPushToken[test-${process.pid}-${Date.now()}-${(tokens += 1)}]`;

/** Push notification tests: the API over HTTP, with a push sender that captures. */
export function pushHarness() {
  const h = dispatchHarness();
  const state: { lender?: TestMember; announcements: string[] } = { announcements: [] };

  const registerRequest = (member: TestMember, token: string) => h.send("PUT", "/members/me/push-device", member.accessToken, { token });
  const register = async (member: TestMember, token = newToken()) => {
    const response = await registerRequest(member, token);
    assert.equal(response.status, 204, await response.clone().text());
    return token;
  };
  const settingsOf = async (member: TestMember) => {
    const response = await h.send("GET", "/members/me/push-settings", member.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as PushSettingsResponse).settings;
  };
  const changeRequest = (member: TestMember, change: unknown) => h.send("PATCH", "/members/me/push-settings", member.accessToken, change);
  const change = async (member: TestMember, settings: Record<string, boolean>) => {
    const response = await changeRequest(member, settings);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as PushSettingsResponse).settings;
  };

  /**
   * The Member places a Hold on a Book another Member has out, which is returned 3 hours later
   * (13:00 when the clock was at 10:00): the Hold is ready. `beforeReturn` runs between the two.
   */
  const holdBecomesReady = async (member: TestMember, title: string, beforeReturn?: () => Promise<void>) => {
    state.lender ??= await createTestMember(h.api(), { firstName: "Lena", lastName: "Lender" });
    const book = await h.lentBook(title, state.lender);
    await h.placeHold(member, book.id);
    await beforeReturn?.();
    h.api().clock.advance({ hours: 3 });
    const returned = await h.giveBack((book.copies[0] as TestCopy).barcode);
    return { book, returned };
  };

  /** An Announcement running from `startsAt` to `endsAt`, inserted straight into the table (the desk endpoints have their own tests). */
  const addAnnouncement = async (title: string, startsAt: string, endsAt: string) => {
    const librarianId = (await createTestAccount(h.api(), { staff: { role: "librarian", fullName: "Lita Reyes" } })).userId;
    const id = randomUUID();
    await h.api().db.query(
      `insert into public.announcements
         (id, title, starts_at, ends_at, poster_path, banner_path, poster_width, poster_height, crop_position,
          created_by, created_at, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, 800, 1000, 0.25, $7, $8, $7, $8)`,
      [id, title, startsAt, endsAt, `${id}/${randomUUID()}.jpg`, `${id}/${randomUUID()}.jpg`, librarianId, h.api().clock.now()],
    );
    state.announcements.push(id);
    return id;
  };

  return {
    ...h,
    registerRequest,
    register,
    settingsOf,
    changeRequest,
    change,
    holdBecomesReady,
    addAnnouncement,
    pushesTo: (token: string) => h.api().pushes.sentTo(token),
    stop: async () => {
      await h.api().db.query("delete from public.announcements where id = any($1::uuid[])", [state.announcements]);
      await h.stop();
    },
  };
}
