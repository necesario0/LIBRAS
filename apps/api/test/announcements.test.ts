import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import sharp from "sharp";
import { ANNOUNCEMENT_MESSAGES } from "@libras/shared";
import type { Announcement, AnnouncementDetails, AnnouncementResponse, DeskAnnouncementsResponse } from "@libras/shared";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness, refusal } from "./loans-harness.ts";
import type { TestLibrarian } from "./loans-harness.ts";

/** A poster as a Librarian's phone or camera saves it: a JPEG that says where it was taken. */
async function posterWithLocation(width = 800, height = 1000): Promise<Uint8Array> {
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 93, b: 195 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "LibrasCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "121/1 3/1 0/1" } })
    .toBuffer();
  return new Uint8Array(bytes);
}

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: "#ffd400" } }).png().toBuffer());
}

const details = (overrides: Partial<AnnouncementDetails> = {}): AnnouncementDetails => ({
  title: "Thesis Writing Clinic",
  body: "One-on-one help with your thesis.",
  link: { kind: "web", url: "https://forms.gle/example-sign-up" },
  firstDay: "2026-11-26",
  lastDay: "2026-12-05",
  cropPosition: 0.25,
  ...overrides,
});

describe("Announcements on the desk page", () => {
  const h = loansHarness();
  let lita: TestLibrarian;
  let manuel: TestLibrarian;
  let ana: TestMember;

  /** Sends the desk page's form: the details as JSON and the poster as a file. */
  const form = (body: unknown, image?: { bytes: Uint8Array; name?: string; type?: string }): FormData => {
    const data = new FormData();
    data.set("details", typeof body === "string" ? body : JSON.stringify(body));
    if (image) data.set("image", new Blob([image.bytes as BlobPart], { type: image.type ?? "image/jpeg" }), image.name ?? "poster.jpg");
    return data;
  };
  const call = (method: string, path: string, token: string | null, body?: FormData) =>
    fetch(`${h.api().baseUrl}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body });
  const create = (who: TestLibrarian | TestMember, body: unknown, image?: Parameters<typeof form>[1]) =>
    call("POST", "/desk/announcements", who.accessToken, form(body, image));
  const edit = (who: TestLibrarian, id: string, body: unknown, image?: Parameters<typeof form>[1]) =>
    call("PUT", `/desk/announcements/${id}`, who.accessToken, form(body, image));
  const end = (who: TestLibrarian, id: string) => call("POST", `/desk/announcements/${id}/end`, who.accessToken);
  const remove = (who: TestLibrarian, id: string) => call("DELETE", `/desk/announcements/${id}`, who.accessToken);
  const list = async (who: TestLibrarian = lita): Promise<DeskAnnouncementsResponse> => {
    const response = await call("GET", "/desk/announcements", who.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as DeskAnnouncementsResponse;
  };
  /** Creates one and expects it to be accepted. */
  const created = async (overrides: Partial<AnnouncementDetails> = {}, who: TestLibrarian = lita): Promise<Announcement> => {
    const response = await create(who, details(overrides), { bytes: await posterWithLocation() });
    assert.equal(response.status, 201, await response.clone().text());
    return ((await response.json()) as AnnouncementResponse).announcement;
  };
  const download = async (url: string): Promise<{ status: number; bytes: Buffer }> => {
    const response = await fetch(url);
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
  };
  const entriesFor = async (id: string) =>
    (await createAuditLog(h.api()).entries({ limit: 5000 })).filter((entry) => entry.subject === id && entry.type.startsWith("announcement_"));
  const clearAnnouncements = async () => {
    const { rows } = await h.api().db.query<{ id: string }>("select id from public.announcements");
    for (const { id } of rows) await remove(lita, id);
    await h.api().db.query("delete from public.announcements");
  };

  before(async () => {
    await h.start();
    lita = await h.librarian("Lita Reyes");
    manuel = await h.librarian("Manuel Cruz");
    ana = await createTestMember(h.api(), { firstName: "Ana", lastName: "Santos" });
  });
  after(async () => {
    h.at("2026-11-01 09:00");
    await clearAnnouncements();
    await h.stop();
  });
  beforeEach(async () => {
    // Everything is cleared as of a day before every test's dates, so even a past one can be deleted.
    h.at("2026-11-01 09:00");
    await clearAnnouncements();
    h.at("2026-11-20 10:00");
  });

  it("creates a scheduled Announcement with its poster and 2:1 banner, stripped of location, and audits it with the Librarian", async () => {
    const response = await create(lita, details(), { bytes: await posterWithLocation(800, 1000) });

    assert.equal(response.status, 201, await response.clone().text());
    const { announcement } = (await response.json()) as AnnouncementResponse;
    assert.equal(announcement.title, "Thesis Writing Clinic");
    assert.equal(announcement.body, "One-on-one help with your thesis.");
    assert.deepEqual(announcement.link, { kind: "web", url: "https://forms.gle/example-sign-up" });
    assert.equal(announcement.status, "scheduled");
    assert.equal(announcement.firstDay, "2026-11-26");
    assert.equal(announcement.lastDay, "2026-12-05");
    // From the start of the first day to the end of the last, Manila time.
    assert.equal(announcement.startsAt, "2026-11-25T16:00:00.000Z");
    assert.equal(announcement.endsAt, "2026-12-05T16:00:00.000Z");
    assert.equal(announcement.createdBy, "Lita Reyes");
    assert.equal(announcement.updatedBy, "Lita Reyes");
    assert.equal(announcement.image.cropPosition, 0.25);
    assert.deepEqual([announcement.image.posterWidth, announcement.image.posterHeight], [800, 1000]);

    const poster = await download(announcement.image.posterUrl);
    const banner = await download(announcement.image.bannerUrl);
    assert.equal(poster.status, 200);
    assert.equal(banner.status, 200);
    const posterMeta = await sharp(poster.bytes).metadata();
    const bannerMeta = await sharp(banner.bytes).metadata();
    assert.deepEqual([posterMeta.format, posterMeta.width, posterMeta.height], ["jpeg", 800, 1000]);
    assert.deepEqual([bannerMeta.format, bannerMeta.width, bannerMeta.height], ["jpeg", 800, 400]);
    // The upload carried a location; nothing that is stored does.
    assert.ok((await sharp(await posterWithLocation()).metadata()).exif, "the test poster has EXIF to strip");
    assert.equal(posterMeta.exif, undefined);
    assert.equal(bannerMeta.exif, undefined);

    assert.deepEqual(await list(), { running: null, scheduled: [announcement], past: [] });
    const entries = await entriesFor(announcement.id);
    assert.deepEqual(
      entries.map((entry) => [entry.type, entry.actorId]),
      [["announcement_created", lita.userId]],
    );
    assert.deepEqual(entries[0]?.data, {
      title: "Thesis Writing Clinic",
      firstDay: "2026-11-26",
      lastDay: "2026-12-05",
      link: "web",
      linkTarget: "https://forms.gle/example-sign-up",
    });
    assert.equal((await createAuditLog(h.api()).verify()).intact, true);
  });

  it("cuts the banner where the crop frame is: the top of a tall poster, the right of a wide one", async () => {
    // A tall poster: yellow top half, blue bottom half. Crop at the top shows yellow.
    const tall = await sharp({ create: { width: 800, height: 1600, channels: 3, background: "#0000ff" } })
      .composite([{ input: await sharp({ create: { width: 800, height: 800, channels: 3, background: "#ffff00" } }).png().toBuffer(), top: 0, left: 0 }])
      .png()
      .toBuffer();
    const top = await create(lita, details({ cropPosition: 0 }), { bytes: new Uint8Array(tall), type: "image/png", name: "tall.png" });
    assert.equal(top.status, 201, await top.clone().text());
    const banner = await download(((await top.json()) as AnnouncementResponse).announcement.image.bannerUrl);
    const { dominant } = await sharp(banner.bytes).stats();
    assert.ok(dominant.r > 200 && dominant.g > 200 && dominant.b < 60, `the top of the poster: ${JSON.stringify(dominant)}`);

    // A wide poster (4:1): red left half, green right half. Crop at the right shows green, and the banner is the poster's height.
    const wide = await sharp({ create: { width: 2400, height: 600, channels: 3, background: "#ff0000" } })
      .composite([{ input: await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#00ff00" } }).png().toBuffer(), top: 0, left: 1200 }])
      .webp({ lossless: true })
      .toBuffer();
    const right = await create(lita, details({ cropPosition: 1, firstDay: "2026-12-10", lastDay: "2026-12-11" }), {
      bytes: new Uint8Array(wide),
      type: "image/webp",
      name: "wide.webp",
    });
    assert.equal(right.status, 201, await right.clone().text());
    const wideAnnouncement = ((await right.json()) as AnnouncementResponse).announcement;
    const wideBanner = await download(wideAnnouncement.image.bannerUrl);
    const wideMeta = await sharp(wideBanner.bytes).metadata();
    assert.equal(wideMeta.width, 2 * (wideMeta.height ?? 0));
    const wideStats = await sharp(wideBanner.bytes).stats();
    assert.ok(wideStats.dominant.g > 200 && wideStats.dominant.r < 60, `the right of the poster: ${JSON.stringify(wideStats.dominant)}`);
  });

  it("refuses every Announcement endpoint to Members and to callers who are not signed in", async () => {
    const announcement = await created();
    const image = { bytes: await posterWithLocation() };
    const attempts = (token: string | null) => [
      call("GET", "/desk/announcements", token),
      call("POST", "/desk/announcements", token, form(details({ firstDay: "2026-12-20", lastDay: "2026-12-21" }), image)),
      call("PUT", `/desk/announcements/${announcement.id}`, token, form(details())),
      call("POST", `/desk/announcements/${announcement.id}/end`, token),
      call("DELETE", `/desk/announcements/${announcement.id}`, token),
      call("GET", "/desk/announcements/books?q=thesis", token),
    ];
    for (const response of await Promise.all(attempts(ana.accessToken))) {
      assert.deepEqual([response.status, (await refusal(response)).code], [403, "not_staff"]);
    }
    for (const response of await Promise.all(attempts(null))) {
      assert.deepEqual([response.status, (await refusal(response)).code], [401, "not_signed_in"]);
    }
    assert.deepEqual(await list(), { running: null, scheduled: [announcement], past: [] });
    assert.equal((await entriesFor(announcement.id)).length, 1);
  });

  it("refuses dates that overlap another Announcement, naming it and its dates", async () => {
    // Made on its first day: it is showing now.
    h.at("2026-11-17 08:00");
    await created({ title: "Library Week 2026", firstDay: "2026-11-17", lastDay: "2026-11-28" });
    h.at("2026-11-20 10:00");

    const response = await create(lita, details({ firstDay: "2026-11-28", lastDay: "2026-12-02" }), { bytes: await posterWithLocation() });

    assert.deepEqual(await refusal(response), {
      status: 409,
      code: "announcement_overlap",
      message:
        "These dates overlap “Library Week 2026” (Nov 17, 2026 to Nov 28, 2026). Only one Announcement shows at a time: pick dates outside it, or end that one first.",
    });
    // The day after its last day is free.
    await created({ firstDay: "2026-11-29", lastDay: "2026-12-02" });
    assert.equal((await list()).scheduled.length, 1);
  });

  it("lets exactly one of two overlapping creates sent at once succeed", async () => {
    const image = { bytes: await posterWithLocation() };
    for (let round = 0; round < 5; round += 1) {
      h.at("2026-11-01 09:00");
      await clearAnnouncements();
      h.at("2026-11-20 10:00");
      const before = (await createAuditLog(h.api()).newest())?.seq ?? 0;
      const [first, second] = await Promise.all([
        create(lita, details({ title: "From Lita", firstDay: "2026-11-26", lastDay: "2026-11-30" }), image),
        create(manuel, details({ title: "From Manuel", firstDay: "2026-11-28", lastDay: "2026-12-03" }), image),
      ]);
      const statuses = [first.status, second.status].sort();
      assert.deepEqual(statuses, [201, 409], `round ${round}`);
      const loser = first.status === 409 ? first : second;
      const winner = first.status === 201 ? first : second;
      const { announcement } = (await winner.json()) as AnnouncementResponse;
      assert.match((await refusal(loser)).message, new RegExp(`overlap “${announcement.title}”`));
      const { scheduled } = await list();
      assert.deepEqual(
        scheduled.map((one) => one.id),
        [announcement.id],
      );
      // The refused one left no audit entry.
      const createdEntries = (await createAuditLog(h.api()).entries({ afterSeq: before })).filter((entry) => entry.type === "announcement_created");
      assert.deepEqual(
        createdEntries.map((entry) => entry.subject),
        [announcement.id],
      );
    }
  });

  it("refuses a file that is not really a JPG, PNG or WebP, whatever its name says", async () => {
    const text = new TextEncoder().encode("This is not a picture, only a renamed text file.");
    const gif = new Uint8Array(await sharp({ create: { width: 800, height: 800, channels: 3, background: "#fff" } }).gif().toBuffer());
    for (const bytes of [text, gif]) {
      const response = await create(lita, details(), { bytes, name: "poster.jpg", type: "image/jpeg" });
      assert.deepEqual(await refusal(response), { status: 400, code: "announcement_image_type", message: ANNOUNCEMENT_MESSAGES.imageType });
    }
    assert.deepEqual((await list()).scheduled, []);
  });

  it("refuses an image over 5 MB, and one too small to look sharp", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(await posterWithLocation());
    const tooBig = await create(lita, details(), { bytes: big });
    assert.deepEqual(await refusal(tooBig), { status: 413, code: "announcement_image_too_large", message: ANNOUNCEMENT_MESSAGES.imageTooLarge });

    const huge = new Uint8Array(12 * 1024 * 1024);
    const wayTooBig = await create(lita, details(), { bytes: huge });
    assert.deepEqual(await refusal(wayTooBig), { status: 413, code: "announcement_image_too_large", message: ANNOUNCEMENT_MESSAGES.imageTooLarge });

    const small = await create(lita, details(), { bytes: await png(300, 300), type: "image/png" });
    assert.deepEqual(await refusal(small), { status: 400, code: "announcement_image_too_small", message: ANNOUNCEMENT_MESSAGES.imageTooSmall });

    const missing = await create(lita, details());
    assert.deepEqual(await refusal(missing), { status: 400, code: "announcement_image_required", message: ANNOUNCEMENT_MESSAGES.imageRequired });
    assert.deepEqual((await list()).scheduled, []);
  });

  it("refuses a web link that is not https, a link to an unknown Book, a missing title and dates out of order, each with how to fix it", async () => {
    const image = { bytes: await posterWithLocation() };
    const cases: [Partial<AnnouncementDetails>, string, number, string][] = [
      [{ link: { kind: "web", url: "http://forms.gle/example" } }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.webLinkInvalid],
      [{ link: { kind: "web", url: "javascript:alert(1)" } }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.webLinkInvalid],
      [{ link: { kind: "web", url: `https://forms.gle/${"x".repeat(600)}` } }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.webLinkTooLong],
      [{ link: { kind: "book", bookId: "00000000-0000-4000-8000-000000000000" } }, "book_not_found", 400, ANNOUNCEMENT_MESSAGES.bookNotFound],
      [{ title: "   " }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.titleRequired],
      [{ firstDay: "2026-12-05", lastDay: "2026-12-01" }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.daysOutOfOrder],
      [{ firstDay: "2026-11-19", lastDay: "2026-12-01" }, "invalid_request", 400, ANNOUNCEMENT_MESSAGES.firstDayPast],
    ];
    for (const [overrides, code, status, message] of cases) {
      const response = await create(lita, details(overrides), image);
      assert.deepEqual(await refusal(response), { status, code, message }, JSON.stringify(overrides));
    }
    const garbled = await create(lita, "{not json", image);
    assert.deepEqual(await refusal(garbled), { status: 400, code: "invalid_request", message: ANNOUNCEMENT_MESSAGES.invalidRequest });
    assert.deepEqual((await list()).scheduled, []);
  });

  it("links a Book of the catalog, and finds Books to link for a Librarian", async () => {
    const book = await h.addBook("Announcements Handbook");
    const announcement = await created({ link: { kind: "book", bookId: book.id }, body: "" });
    assert.deepEqual(announcement.link, { kind: "book", bookId: book.id, bookTitle: "Announcements Handbook" });
    assert.equal(announcement.body, null);

    const response = await call("GET", "/desk/announcements/books?q=announcements%20handbook", lita.accessToken);
    assert.equal(response.status, 200, await response.clone().text());
    const { books } = (await response.json()) as { books: { id: string; title: string }[] };
    assert.equal(books[0]?.id, book.id);
  });

  it("starts showing at the start of its first day: listed as showing now, then past after its last day", async () => {
    const announcement = await created({ firstDay: "2026-11-20", lastDay: "2026-11-21" });
    assert.equal(announcement.status, "running");
    assert.equal((await list()).running?.id, announcement.id);
    h.at("2026-11-21 23:59");
    assert.equal((await list()).running?.id, announcement.id);
    h.at("2026-11-22 00:00");
    const later = await list();
    assert.equal(later.running, null);
    assert.deepEqual(
      later.past.map((one) => [one.id, one.status]),
      [[announcement.id, "past"]],
    );
  });

  it("edits a scheduled Announcement and replaces both images, removing the old ones; audits it with the Librarian", async () => {
    const announcement = await created();
    const replacement = await png(1000, 1000);

    const response = await edit(manuel, announcement.id, details({ title: "Thesis Clinic, new room", cropPosition: 1, link: { kind: "none" } }), {
      bytes: replacement,
      type: "image/png",
      name: "new.png",
    });

    assert.equal(response.status, 200, await response.clone().text());
    const updated = ((await response.json()) as AnnouncementResponse).announcement;
    assert.equal(updated.title, "Thesis Clinic, new room");
    assert.equal(updated.link, null);
    assert.equal(updated.createdBy, "Lita Reyes");
    assert.equal(updated.updatedBy, "Manuel Cruz");
    assert.deepEqual([updated.image.posterWidth, updated.image.posterHeight], [1000, 1000]);
    assert.notEqual(updated.image.posterUrl, announcement.image.posterUrl);
    assert.notEqual(updated.image.bannerUrl, announcement.image.bannerUrl);
    assert.equal((await download(updated.image.posterUrl)).status, 200);
    assert.equal((await download(updated.image.bannerUrl)).status, 200);
    for (const old of [announcement.image.posterUrl, announcement.image.bannerUrl]) {
      assert.notEqual((await download(old)).status, 200, `${old} is removed`);
    }

    const entries = await entriesFor(announcement.id);
    assert.deepEqual(
      entries.map((entry) => [entry.type, entry.actorId]),
      [
        ["announcement_created", lita.userId],
        ["announcement_edited", manuel.userId],
      ],
    );
    assert.deepEqual(entries[1]?.data, {
      title: "Thesis Clinic, new room",
      firstDay: "2026-11-26",
      lastDay: "2026-12-05",
      link: "none",
      linkTarget: null,
      imageReplaced: true,
    });
  });

  it("edits the running one: a new crop alone cuts a new banner from the stored poster, and its last day can move", async () => {
    const running = await created({ firstDay: "2026-11-20", lastDay: "2026-11-25", cropPosition: 0 });
    h.at("2026-11-22 09:00");

    const response = await edit(lita, running.id, details({ firstDay: "2026-11-20", lastDay: "2026-11-27", cropPosition: 1 }));

    assert.equal(response.status, 200, await response.clone().text());
    const updated = ((await response.json()) as AnnouncementResponse).announcement;
    assert.equal(updated.status, "running");
    assert.deepEqual([updated.firstDay, updated.lastDay], ["2026-11-20", "2026-11-27"]);
    assert.equal(updated.image.cropPosition, 1);
    assert.equal(updated.image.posterUrl, running.image.posterUrl);
    assert.notEqual(updated.image.bannerUrl, running.image.bannerUrl);
    assert.equal((await download(updated.image.bannerUrl)).status, 200);
    assert.notEqual((await download(running.image.bannerUrl)).status, 200);
    assert.deepEqual((await entriesFor(running.id))[1]?.data, {
      title: "Thesis Writing Clinic",
      firstDay: "2026-11-20",
      lastDay: "2026-11-27",
      link: "web",
      linkTarget: "https://forms.gle/example-sign-up",
      imageReplaced: false,
    });

    // Its first day is behind it: it can stay, but it cannot move to another day in the past.
    const moved = await edit(lita, running.id, details({ firstDay: "2026-11-21", lastDay: "2026-11-27" }));
    assert.deepEqual(await refusal(moved), { status: 400, code: "invalid_request", message: ANNOUNCEMENT_MESSAGES.firstDayPast });
  });

  it("refuses an edit that would overlap another Announcement", async () => {
    await created({ title: "Library Week 2026", firstDay: "2026-11-21", lastDay: "2026-11-28" });
    const later = await created({ title: "Holiday hours", firstDay: "2026-12-15", lastDay: "2027-01-04" });
    const response = await edit(lita, later.id, details({ firstDay: "2026-11-27", lastDay: "2027-01-04" }));
    assert.equal((await refusal(response)).code, "announcement_overlap");
    assert.equal((await list()).scheduled.find((one) => one.id === later.id)?.firstDay, "2026-12-15");
  });

  it("ends the running Announcement now: it stops showing at once and its last day becomes today", async () => {
    const announcement = await created({ firstDay: "2026-11-20", lastDay: "2026-11-28" });
    h.at("2026-11-23 14:30");

    const response = await end(manuel, announcement.id);

    assert.equal(response.status, 200, await response.clone().text());
    const ended = ((await response.json()) as AnnouncementResponse).announcement;
    assert.equal(ended.status, "past");
    assert.equal(ended.endsAt, "2026-11-23T06:30:00.000Z");
    assert.equal(ended.lastDay, "2026-11-23");
    const now = await list();
    assert.equal(now.running, null);
    assert.deepEqual(
      now.past.map((one) => one.id),
      [announcement.id],
    );
    // The rest of its days are free again.
    await created({ firstDay: "2026-11-24", lastDay: "2026-11-28" });

    const entries = await entriesFor(announcement.id);
    assert.deepEqual(
      entries.map((entry) => [entry.type, entry.actorId]),
      [
        ["announcement_created", lita.userId],
        ["announcement_ended", manuel.userId],
      ],
    );
    assert.deepEqual(entries[1]?.data, { title: "Thesis Writing Clinic", endsAt: "2026-11-23T06:30:00.000Z", plannedLastDay: "2026-11-28" });

    // Ended, it is past and read-only.
    assert.deepEqual(await refusal(await end(lita, announcement.id)), {
      status: 409,
      code: "announcement_past",
      message: ANNOUNCEMENT_MESSAGES.pastReadOnly,
    });
    assert.equal((await refusal(await edit(lita, announcement.id, details()))).code, "announcement_past");
    assert.equal((await refusal(await remove(lita, announcement.id))).code, "announcement_past");
  });

  it("deletes a scheduled Announcement with its images, but not the running one, which is ended instead", async () => {
    const running = await created({ title: "Library Week 2026", firstDay: "2026-11-20", lastDay: "2026-11-22" });
    const scheduled = await created({ firstDay: "2026-12-01", lastDay: "2026-12-02" });

    assert.deepEqual(await refusal(await remove(lita, running.id)), {
      status: 409,
      code: "announcement_not_scheduled",
      message: ANNOUNCEMENT_MESSAGES.deleteNotScheduled,
    });
    assert.deepEqual(await refusal(await end(lita, scheduled.id)), {
      status: 409,
      code: "announcement_not_running",
      message: ANNOUNCEMENT_MESSAGES.endNotRunning,
    });

    const response = await remove(manuel, scheduled.id);
    assert.equal(response.status, 204, await response.clone().text());
    assert.deepEqual((await list()).scheduled, []);
    assert.notEqual((await download(scheduled.image.posterUrl)).status, 200);
    assert.notEqual((await download(scheduled.image.bannerUrl)).status, 200);
    const entries = await entriesFor(scheduled.id);
    assert.deepEqual(
      entries.map((entry) => [entry.type, entry.actorId]),
      [
        ["announcement_created", lita.userId],
        ["announcement_deleted", manuel.userId],
      ],
    );
    assert.deepEqual(entries[1]?.data, { title: "Thesis Writing Clinic", firstDay: "2026-12-01", lastDay: "2026-12-02" });

    assert.deepEqual(await refusal(await remove(lita, scheduled.id)), { status: 404, code: "announcement_not_found", message: ANNOUNCEMENT_MESSAGES.notFound });
  });
});
