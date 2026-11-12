import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices, expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { CODE128_QUIET_ZONE_MODULES, SCANNER_MESSAGES, encodeCode128C } from "@libras/shared";
import { createDeskFixtures, scan, signInAtTheDesk } from "./desk-fixtures.ts";
import type { DeskTestCopy } from "./desk-fixtures.ts";

const desk = createDeskFixtures();
const { addBook, codeOnThePhoneOf, createMember } = desk;

/** The web pages Playwright starts (playwright.config.ts). */
const WEB_URL = "http://127.0.0.1:5174";

test.beforeAll(desk.setUp);
test.afterAll(desk.cleanUp);

/** The phone: a second browser context at a phone's size, on the scanner page. */
async function openPhone(browser: Browser): Promise<{ context: BrowserContext; phone: Page }> {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: WEB_URL, permissions: ["camera"] });
  const phone = await context.newPage();
  await phone.goto("/scan.html");
  await expect(phone.getByRole("heading", { name: "Use this phone as the scanner" })).toBeVisible();
  return { context, phone };
}

/** The pairing code the desk page shows, as six digits. */
async function codeOnTheDesk(page: Page): Promise<string> {
  const text = await page.getByTestId("pairing-code").innerText();
  return text.replace(/\s/g, "");
}

async function pairWith(phone: Page, code: string) {
  await phone.getByLabel("Pairing code").fill(code);
  await phone.getByRole("button", { name: "Connect" }).click();
  await expect(phone.getByTestId("scanner-link")).toHaveText("Connected to desk");
}

/** What the phone does when its camera reads a barcode, except for the camera: the text goes the same way. */
async function injectScanOnThePhone(phone: Page, text: string) {
  await phone.getByLabel("Barcode damaged? Type the code").fill(text);
  await phone.getByRole("button", { name: "Send" }).click();
}

test("the desk page shows a pairing code, and the phone refuses a wrong one and accepts the right one", async ({ page, browser }) => {
  await signInAtTheDesk(page);
  await expect(page.getByTestId("pairing-status")).toHaveText("Not paired");
  const code = await codeOnTheDesk(page);
  expect(code).toMatch(/^\d{6}$/);
  await expect(page.getByText("A new code in")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desk-pairing-code.png") });

  const { context, phone } = await openPhone(browser);
  await phone.screenshot({ path: test.info().outputPath("phone-pair.png") });

  // The Connect button waits for six digits.
  await phone.getByLabel("Pairing code").fill("123");
  await expect(phone.getByRole("button", { name: "Connect" })).toBeDisabled();

  const wrong = code === "000000" ? "111111" : "000000";
  await phone.getByLabel("Pairing code").fill(wrong);
  await phone.getByRole("button", { name: "Connect" }).click();
  await expect(phone.getByRole("alert")).toHaveText(SCANNER_MESSAGES.pairingCodeInvalid);
  await phone.screenshot({ path: test.info().outputPath("phone-wrong-code.png") });

  // Typed the way the desk shows it, with the space.
  await pairWith(phone, `${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(page.getByTestId("pairing-status")).toHaveText("Phone paired");
  await expect(page.getByTestId("pairing-code")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("desk-paired.png") });
  await phone.screenshot({ path: test.info().outputPath("phone-paired.png") });
  await context.close();
});

test("scans from the paired phone and typed input feed the same scan input point", async ({ page, browser }) => {
  const dana = await createMember("umak_student", "Dana", "Villanueva");
  const [first, second] = (await addBook("Scanned By Phone", 2)) as [DeskTestCopy, DeskTestCopy];
  await signInAtTheDesk(page);
  const { context, phone } = await openPhone(browser);
  await pairWith(phone, await codeOnTheDesk(page));

  // The phone reads the Digital ID: the desk identifies the Member as if it had been typed there.
  const sentAt = Date.now();
  await injectScanOnThePhone(phone, await codeOnThePhoneOf(dana));
  await expect(page.getByTestId("pairing-last-scan")).toContainText("Last scan from the phone: ");
  const arrivedAfter = Date.now() - sentAt;
  expect(arrivedAfter, "the scan reached the desk page within about a second").toBeLessThan(1500);
  await expect(phone.getByTestId("scanner-feedback")).toContainText("Sent");
  const card = page.getByRole("region", { name: "Dana Villanueva" });
  await expect(card.getByTestId("desk-member-loans")).toHaveText("0 of 3");

  // The phone reads a Copy: the Loan is confirmed.
  await injectScanOnThePhone(phone, first.barcode);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toContainText(`Copy ${first.accessionNumber}`);
  await expect(card.getByTestId("desk-member-loans")).toHaveText("1 of 3");
  await expect(page.getByTestId("pairing-last-scan")).toHaveText(`Last scan from the phone: ${first.barcode}`);
  await page.screenshot({ path: test.info().outputPath("desk-loan-by-phone.png") });
  await phone.screenshot({ path: test.info().outputPath("phone-sent.png") });

  // Typed input on the desk keeps working while the phone is paired, with no change.
  await scan(page, second.accessionNumber);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toContainText(`Copy ${second.accessionNumber}`);
  await expect(card.getByTestId("desk-member-loans")).toHaveText("2 of 3");
  await context.close();
});

test("the phone refuses a read the whitelist does not allow, and the desk page never hears it", async ({ page, browser }) => {
  await signInAtTheDesk(page);
  const { context, phone } = await openPhone(browser);
  await pairWith(phone, await codeOnTheDesk(page));

  await injectScanOnThePhone(phone, "4821<script>");

  await expect(phone.getByRole("alert")).toContainText("characters a LIBRAS barcode never has");
  await expect(page.getByTestId("pairing-last-scan")).toHaveText("Waiting for the first scan...");
  await phone.screenshot({ path: test.info().outputPath("phone-refused.png") });
  await context.close();
});

test("unpairing from the desk page tells the phone, and the desk page shows a new code", async ({ page, browser }) => {
  await signInAtTheDesk(page);
  const { context, phone } = await openPhone(browser);
  await pairWith(phone, await codeOnTheDesk(page));

  await page.getByRole("button", { name: "Unpair this phone" }).click();

  await expect(page.getByTestId("pairing-status")).toHaveText("Not paired");
  await expect(page.getByTestId("pairing-code")).toBeVisible();
  // The phone finds out on its next check (every few seconds), or at once when it sends something.
  await injectScanOnThePhone(phone, "3100000000");
  await expect(phone.getByText(SCANNER_MESSAGES.pairingLost)).toBeVisible();
  await expect(phone.getByRole("heading", { name: "Use this phone as the scanner" })).toBeVisible();
  await phone.screenshot({ path: test.info().outputPath("phone-lost.png") });

  // And it can pair again with the new code.
  await pairWith(phone, await codeOnTheDesk(page));
  await expect(page.getByTestId("pairing-status")).toHaveText("Phone paired");
  await context.close();
});

test("closing the desk page shows the phone that the desk page is offline", async ({ page, browser }) => {
  await signInAtTheDesk(page);
  const { context, phone } = await openPhone(browser);
  await pairWith(phone, await codeOnTheDesk(page));

  await page.close();

  await expect(phone.getByTestId("scanner-link")).toHaveText("Desk page offline", { timeout: 15_000 });
  await injectScanOnThePhone(phone, "3100000000");
  await expect(phone.getByRole("alert")).toContainText(SCANNER_MESSAGES.deskOffline);
  await phone.screenshot({ path: test.info().outputPath("phone-desk-offline.png") });
  await context.close();
});

/**
 * A y4m video of one still picture: Chrome plays it back as the camera. The
 * picture is a Code 128 barcode in the middle of a white frame.
 */
function writeBarcodeVideo(file: string, digits: string): void {
  const width = 640;
  const height = 480;
  const moduleWidth = 5;
  const luma = Buffer.alloc(width * height, 235); // white
  const { widths } = encodeCode128C(digits);
  const modules = widths.reduce((sum, w) => sum + w, 0);
  let x = ((width - (modules + 2 * CODE128_QUIET_ZONE_MODULES) * moduleWidth) / 2) + CODE128_QUIET_ZONE_MODULES * moduleWidth;
  widths.forEach((barOrSpace, index) => {
    const end = x + barOrSpace * moduleWidth;
    if (index % 2 === 0) {
      for (let row = 160; row < 320; row += 1) luma.fill(16, row * width + x, row * width + end);
    }
    x = end;
  });
  const chroma = Buffer.alloc((width * height) / 4, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(file, Buffer.concat([header, ...Array<Buffer>(10).fill(frame)]));
}

test("a barcode in front of the phone camera is read and arrives on the desk page", async ({ page }) => {
  const [copy] = (await addBook("Seen By The Camera", 1)) as [DeskTestCopy];
  const folder = mkdtempSync(join(tmpdir(), "libras-camera-"));
  const video = join(folder, "barcode.y4m");
  writeBarcodeVideo(video, copy.barcode);
  // A browser of its own, whose fake camera plays that picture.
  const camera = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    await signInAtTheDesk(page);
    const context = await camera.newContext({ ...devices["Pixel 7"], baseURL: WEB_URL, permissions: ["camera"] });
    const phone = await context.newPage();
    await phone.goto("/scan.html");
    await pairWith(phone, await codeOnTheDesk(page));

    // Nothing typed anywhere: the camera read the barcode. With no Member at the desk a Copy is a return attempt.
    await expect(phone.getByTestId("scanner-feedback")).toContainText(`Sent ${copy.barcode}`, { timeout: 15_000 });
    await expect(page.getByTestId("pairing-last-scan")).toHaveText(`Last scan from the phone: ${copy.barcode}`);
    await expect(page.getByRole("alert")).toBeVisible();
    await phone.screenshot({ path: test.info().outputPath("phone-camera-read.png") });
  } finally {
    await camera.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
