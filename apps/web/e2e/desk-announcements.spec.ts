import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { formatAnnouncementDay, libraryDayOf, nextLibraryDay } from "@libras/shared";
import { announcementFiles } from "../../api/src/announcements/storage.ts";
import { loadConfig } from "../../api/src/config.ts";
import { createDeskFixtures, signInAtTheDesk } from "./desk-fixtures.ts";

const fixtures = createDeskFixtures();
const files = announcementFiles(loadConfig());

/** Removes every Announcement and its images, so this run's dates are free whatever ran before. */
async function clearAnnouncements() {
  const { rows } = await fixtures.db.query<{ poster_path: string; banner_path: string }>("delete from public.announcements returning poster_path, banner_path");
  await files.remove(rows.flatMap((row) => [row.poster_path, row.banner_path]));
}

/** A poster as the library makes them: taller than wide, yellow on top, blue below. */
async function poster(): Promise<Buffer> {
  const top = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#fcbf49" } }).png().toBuffer();
  return sharp({ create: { width: 800, height: 1000, channels: 3, background: "#005dc3" } })
    .composite([{ input: top, top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
}

test.beforeAll(async () => {
  await fixtures.setUp();
  await clearAnnouncements();
});
test.afterAll(async () => {
  await clearAnnouncements();
  await fixtures.cleanUp();
});

test("a Librarian publishes an Announcement with a poster and a crop, is refused overlapping dates, then ends it", async ({ page }) => {
  const today = libraryDayOf(new Date());
  const inTwoDays = nextLibraryDay(nextLibraryDay(today));
  await signInAtTheDesk(page);
  await page.getByRole("link", { name: "Announcements" }).click();
  await expect(page.getByRole("heading", { name: "New Announcement" })).toBeVisible();
  await expect(page.getByTestId("ann-running")).toContainText("Nothing is showing on Home.");

  // The poster, then the crop: the frame starts in the middle and is dragged up to the top.
  await page.getByLabel("Poster image").setInputFiles({ name: "library-week.jpg", mimeType: "image/jpeg", buffer: await poster() });
  const frame = page.getByTestId("crop-frame");
  await expect(frame).toHaveAttribute("aria-valuenow", "50");
  const box = await frame.boundingBox();
  if (!box) throw new Error("The crop frame is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 400, { steps: 5 });
  await page.mouse.up();
  await expect(frame).toHaveAttribute("aria-valuenow", "0");

  await page.getByLabel("Title").fill("Library Week 2026");
  await page.getByRole("radio", { name: "A web page" }).click();
  await page.getByLabel("Web address").fill("http://forms.gle/library-week");
  await page.getByLabel("Show from").fill(today);
  await page.getByLabel("Until").fill(inTwoDays);
  await expect(page.getByTestId("ann-check")).toHaveText("Enter a full web address that starts with https://, or choose No link.");
  await page.getByLabel("Web address").fill("https://forms.gle/library-week");
  await expect(page.getByTestId("ann-check")).toHaveText(`Shows on every Member's Home now, until ${formatAnnouncementDay(inTwoDays)}.`);
  await page.getByRole("button", { name: "Publish now" }).click();

  await expect(page.getByTestId("ann-notice")).toHaveText(`“Library Week 2026” is showing on every Member's Home now, until ${formatAnnouncementDay(inTwoDays)}.`);
  const running = page.getByTestId("ann-running").getByRole("article", { name: "Library Week 2026" });
  await expect(running).toContainText(`${formatAnnouncementDay(today)} to ${formatAnnouncementDay(inTwoDays)}`);
  // The banner the API cut is the top of the poster: the yellow half.
  const bannerUrl = await running.locator("img").getAttribute("src");
  if (!bannerUrl) throw new Error("The card has no banner");
  const banner = Buffer.from(await (await fetch(bannerUrl)).arrayBuffer());
  const { dominant } = await sharp(banner).stats();
  expect(dominant.r).toBeGreaterThan(200);
  expect(dominant.b).toBeLessThan(120);

  // A second one for overlapping dates is refused, naming the one in the way.
  await page.getByLabel("Poster image").setInputFiles({ name: "clinic.jpg", mimeType: "image/jpeg", buffer: await poster() });
  await page.getByLabel("Title").fill("Thesis Writing Clinic");
  await page.getByLabel("Show from").fill(nextLibraryDay(today));
  await page.getByLabel("Until").fill(nextLibraryDay(inTwoDays));
  await expect(page.getByTestId("ann-check")).toHaveText(
    `These dates overlap “Library Week 2026” (${formatAnnouncementDay(today)} to ${formatAnnouncementDay(inTwoDays)}). Only one Announcement shows at a time: pick dates outside it, or end that one first.`,
  );
  await expect(page.getByRole("button", { name: "Schedule" })).toBeDisabled();

  // End now asks once more, then takes it down at once.
  await running.getByRole("button", { name: "End now" }).click();
  await running.getByRole("button", { name: "Yes, end it" }).click();
  await expect(page.getByTestId("ann-notice")).toHaveText("“Library Week 2026” has ended. Members no longer see it.");
  await expect(page.getByTestId("ann-running")).toContainText("Nothing is showing on Home.");
  await expect(page.getByTestId("ann-past").getByRole("article", { name: "Library Week 2026" })).toContainText("Copy as new");
});
