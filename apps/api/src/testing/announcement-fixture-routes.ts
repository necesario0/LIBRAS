import { randomUUID } from "node:crypto";
import type { Router } from "express";
import sharp from "sharp";
import { libraryDayOf, nextLibraryDay } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { createAnnouncement } from "../announcements/index.ts";
import { seedLibrarians } from "../seed/librarians.ts";

const FIXTURE_LIBRARIAN = { email: "e2e-announcement-desk@libras.test", fullName: "Lita Reyes" };

/**
 * Routes that let an end-to-end test on another process put an Announcement on Home the way a Librarian does:
 * the real creation (a poster image made here, stored, cut to the 2:1 banner, audited). They exist only on the
 * end-to-end server (`e2e-server.ts`): the real server never imports this module.
 *
 *   POST /e2e/announcements { title, body?, bookId?, url?, startsInDays?, lengthInDays?, posterMissing? } -> 201 { id }
 *   (runs from `startsInDays` days from today, default 0, for `lengthInDays` days, default 3; replaces whatever
 *   was running or scheduled, since only one shows at a time; with `posterMissing` the poster's address leads to
 *   no file, so the app shows what it does when a poster fails to load)
 *
 *   POST /e2e/announcements/clear -> 200 { removed }   (every Announcement is deleted, so Home has no banner)
 */
export function announcementFixtureRoutes(router: Router, deps: AppDeps): void {
  let librarian: Promise<string> | undefined;
  const librarianId = (): Promise<string> => {
    librarian ??= (async () => {
      await seedLibrarians(deps.db, [{ ...FIXTURE_LIBRARIAN, password: `e2e-${randomUUID()}` }]);
      const { rows } = await deps.db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [FIXTURE_LIBRARIAN.email]);
      if (!rows[0]) throw new Error("The fixture Librarian was not created");
      return rows[0].id;
    })();
    return librarian;
  };

  router.post("/e2e/announcements/clear", async (_req, res) => {
    const { rowCount } = await deps.db.query("delete from public.announcements");
    res.json({ removed: rowCount ?? 0 });
  });

  router.post("/e2e/announcements", async (req, res) => {
    const { title, body, bookId, url, startsInDays = 0, lengthInDays = 3, posterMissing = false } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof title !== "string" ||
      (body !== undefined && typeof body !== "string") ||
      (bookId !== undefined && typeof bookId !== "string") ||
      (url !== undefined && typeof url !== "string") ||
      typeof startsInDays !== "number" ||
      typeof lengthInDays !== "number" ||
      typeof posterMissing !== "boolean" ||
      !Number.isInteger(startsInDays) ||
      !Number.isInteger(lengthInDays) ||
      startsInDays < 0 ||
      lengthInDays < 1
    ) {
      res.status(400).json({ error: { code: "invalid_request", message: "Not an Announcement fixture." } });
      return;
    }
    await deps.db.query("delete from public.announcements");
    let firstDay = libraryDayOf(deps.clock.now());
    for (let i = 0; i < startsInDays; i++) firstDay = nextLibraryDay(firstDay);
    let lastDay = firstDay;
    for (let i = 1; i < lengthInDays; i++) lastDay = nextLibraryDay(lastDay);
    // A tall poster, blue with a yellow band, so the full image is clearly taller than the 2:1 banner.
    const poster = await sharp({ create: { width: 800, height: 1100, channels: 3, background: { r: 0, g: 93, b: 195 } } })
      .composite([{ input: { create: { width: 800, height: 300, channels: 3, background: { r: 252, g: 191, b: 73 } } }, top: 400, left: 0 }])
      .jpeg()
      .toBuffer();
    const link = bookId !== undefined ? { kind: "book" as const, bookId } : url !== undefined ? { kind: "web" as const, url } : { kind: "none" as const };
    const made = await createAnnouncement(
      deps,
      { userId: await librarianId(), email: FIXTURE_LIBRARIAN.email },
      { title, body: body === undefined ? null : body, link, firstDay, lastDay, cropPosition: 0.5 },
      new Uint8Array(poster),
    );
    if (posterMissing) {
      await deps.db.query("update public.announcements set poster_path = id::text || '/' || gen_random_uuid()::text || '.jpg' where id = $1", [made.id]);
    }
    res.status(201).json({ id: made.id });
  });
}
