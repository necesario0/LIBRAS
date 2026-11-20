import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import type { HomeResponse } from "@libras/shared";
import { createTestAccount, createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

/**
 * GET /home: the Announcement. Rows are inserted straight into the table (the desk endpoints have their own
 * tests) and the test clock moves between "now", "before" and "after" so only the running one is ever returned.
 * The clock sits in 2091, where no other test keeps an Announcement.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00+08:00`);

describe("GET /home: the Announcement", () => {
  let api: TestApi;
  let librarianId: string;
  let member: TestMember;
  let bookId: string;

  async function addAnnouncement(
    title: string,
    firstDay: string,
    endDayExclusive: string,
    extra: { body?: string | null; bookId?: string | null; url?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    const { rows } = await api.db.query(
      `insert into public.announcements
         (id, title, body, link_book_id, link_url, starts_at, ends_at, poster_path, banner_path, poster_width, poster_height, crop_position,
          created_by, created_at, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 800, 1000, 0.25, $10, $11, $10, $11) returning id`,
      [
        id, title, extra.body ?? null, extra.bookId ?? null, extra.url ?? null, day(firstDay), day(endDayExclusive),
        `${id}/${randomUUID()}.jpg`, `${id}/${randomUUID()}.jpg`, librarianId, api.clock.now(),
      ],
    );
    return rows[0].id;
  }

  async function home(): Promise<HomeResponse> {
    const response = await fetch(`${api.baseUrl}/home`, { headers: { authorization: `Bearer ${member.accessToken}` } });
    assert.equal(response.status, 200);
    return (await response.json()) as HomeResponse;
  }

  before(async () => {
    api = await startTestApi();
    api.clock.set("2091-03-10T09:00:00+08:00");
    librarianId = (await createTestAccount(api, { staff: { role: "librarian", fullName: "Lita Reyes" } })).userId;
    member = await createTestMember(api);
    const { rows } = await api.db.query("insert into public.books (title, authors) values ('Announced Book', '{Someone}') returning id");
    bookId = rows[0].id;
  });
  beforeEach(async () => {
    await api.db.query("delete from public.announcements");
  });
  after(async () => {
    await api.db.query("delete from public.announcements");
    await api.db.query("delete from public.books where id = $1", [bookId]);
    await api.close();
  });

  it("returns null when none is running", async () => {
    assert.equal((await home()).announcement, null);
  });

  it("returns the running one with its images, dates and link, and nothing a Librarian-only screen knows", async () => {
    const id = await addAnnouncement("Thesis Clinic", "2091-03-09", "2091-03-12", { body: "Bring your draft.", url: "https://forms.gle/abc" });
    const { announcement } = await home();
    assert.ok(announcement);
    assert.equal(announcement.id, id);
    assert.equal(announcement.title, "Thesis Clinic");
    assert.equal(announcement.body, "Bring your draft.");
    assert.deepEqual(announcement.link, { kind: "web", url: "https://forms.gle/abc" });
    assert.equal(announcement.firstDay, "2091-03-09");
    assert.equal(announcement.lastDay, "2091-03-11");
    assert.match(announcement.image.bannerUrl, /^https?:\/\/.+\.jpg$/);
    assert.match(announcement.image.posterUrl, /^https?:\/\/.+\.jpg$/);
    assert.deepEqual([announcement.image.posterWidth, announcement.image.posterHeight], [800, 1000]);
    for (const hidden of ["createdBy", "updatedBy", "updatedAt", "status"]) assert.equal(hidden in announcement, false, hidden);
  });

  it("returns a Book link with the Book's title", async () => {
    await addAnnouncement("Read this", "2091-03-10", "2091-03-11", { bookId });
    const { announcement } = await home();
    assert.deepEqual(announcement?.link, { kind: "book", bookId, bookTitle: "Announced Book" });
    assert.equal(announcement?.body, null);
  });

  it("returns a null link when there is none", async () => {
    await addAnnouncement("Plain", "2091-03-10", "2091-03-11");
    assert.equal((await home()).announcement?.link, null);
  });

  it("does not return a scheduled one, a past one or one ended early, and returns the running one among them", async () => {
    await addAnnouncement("Scheduled", "2091-03-11", "2091-03-13");
    await addAnnouncement("Past", "2091-03-01", "2091-03-05");
    await addAnnouncement("Ended early", "2091-03-06", "2091-03-10");
    assert.equal((await home()).announcement, null);
    await addAnnouncement("Running", "2091-03-10", "2091-03-11");
    assert.equal((await home()).announcement?.title, "Running");
  });

  it("follows the clock: scheduled, then running through its last day, then gone", async () => {
    await addAnnouncement("Window", "2091-03-12", "2091-03-14");
    assert.equal((await home()).announcement, null);
    api.clock.set("2091-03-12T00:00:00+08:00");
    assert.equal((await home()).announcement?.title, "Window");
    api.clock.set("2091-03-13T23:59:00+08:00");
    assert.equal((await home()).announcement?.title, "Window");
    api.clock.set("2091-03-14T00:00:00+08:00");
    assert.equal((await home()).announcement, null);
    api.clock.set("2091-03-10T09:00:00+08:00");
  });
});
