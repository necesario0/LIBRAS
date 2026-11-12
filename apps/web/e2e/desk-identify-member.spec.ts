import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { DigitalIdResponse } from "@libras/shared";
import { createTestAccount, signInDirect } from "@libras/api/testing";
import { loadConfig } from "../../api/src/config.ts";
import { createDatabase } from "../../api/src/db.ts";
import { currentDigitalId } from "../../api/src/digital-id/index.ts";
import { seedLibrarians } from "../../api/src/seed/librarians.ts";

// The same database the API under test uses: `loadConfig` gives the local Supabase one.
const db = createDatabase(loadConfig().databaseUrl, console);
// The API Playwright starts (playwright.config.ts).
const API_URL = "http://127.0.0.1:3101";

const librarian = { email: "e2e-librarian@libras.test", password: "e2e-librarian-pw-1", fullName: "Lita Reyes" };
const member = { userId: "", email: "", password: "", accessToken: "" };

test.beforeAll(async () => {
  await seedLibrarians(db, [librarian]);

  // A UMAK Student Member, as sign-up leaves one.
  const account = await createTestAccount({ db });
  const unique = randomUUID().replaceAll("-", "").slice(0, 10);
  await db.query(
    `insert into public.members (user_id, account_type, first_name, middle_name, last_name, username, details, terms_accepted_at)
     values ($1, 'umak_student', 'Ana', 'Cruz', 'Santos', $2, $3, now())`,
    [account.userId, `ana_${unique}`, JSON.stringify({ studentNumber: `K${randomInt(10_000_000, 99_999_999)}`, college: "CCIS" })],
  );
  const accessToken = await signInDirect(account.email, account.password);
  if (accessToken === undefined) throw new Error("The test Member could not sign in");
  Object.assign(member, { ...account, accessToken });
});
test.afterAll(() => db.end());

/** The code the Member's app shows right now, from the real endpoint. */
async function codeOnTheMembersPhone(): Promise<string> {
  const response = await fetch(`${API_URL}/members/me/digital-id`, {
    headers: { authorization: `Bearer ${member.accessToken}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as DigitalIdResponse).code;
}

async function signInAtTheDesk(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(librarian.email);
  await page.getByLabel("Password", { exact: true }).fill(librarian.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toBeVisible();
}

/** What a USB barcode scanner does: types the characters into the focused page and presses Enter. */
async function scan(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("a Librarian identifies a Member by the Digital ID typed in and ended with Enter", async ({ page }) => {
  await signInAtTheDesk(page);

  // The scan field has the focus as soon as the desk opens, so a scanner needs no click first.
  await expect(page.getByLabel("Scan or type a code")).toBeFocused();
  await scan(page, await codeOnTheMembersPhone());

  const card = page.getByRole("region", { name: "Ana Cruz Santos" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("UMAK Student");
  await expect(card.getByTestId("desk-member-loans")).toHaveText("0 of 3");
  await expect(card).toContainText("7-day loan period");
  await expect(page.getByLabel("Scan or type a code")).toHaveValue("");
  await page.screenshot({ path: test.info().outputPath("desk-member.png") });

  // Typed by hand the way the app prints it, with spaces between the groups.
  const printed = (await codeOnTheMembersPhone()).replace(/(\d{4})(?=\d)/g, "$1 ");
  await scan(page, printed);
  await expect(page.getByRole("region", { name: "Ana Cruz Santos" })).toBeVisible();
});

test("an expired Digital ID is rejected with a clear message", async ({ page }) => {
  await signInAtTheDesk(page);
  // The code the Member's phone showed three minutes ago: the same derivation with the clock swapped.
  const threeMinutesAgo = { now: () => new Date(Date.now() - 3 * 60_000) };
  const { code } = await currentDigitalId({ db, clock: threeMinutesAgo }, member.userId);

  await scan(page, code);

  await expect(page.getByRole("alert")).toHaveText(
    "This Digital ID has expired. Ask the Member to show the code on their screen now.",
  );
  await expect(page.getByRole("region", { name: "Ana Cruz Santos" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("desk-expired.png") });
});

test("scan input outside the whitelist or not a Digital ID is refused on the desk", async ({ page }) => {
  await signInAtTheDesk(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/desk/")) calls.push(request.url());
  });

  await scan(page, "4821<script>");
  await expect(page.getByRole("alert")).toHaveText(
    "That scan has characters a LIBRAS barcode never has. Scan it again or type the code.",
  );

  await scan(page, "12345");
  await expect(page.getByRole("alert")).toHaveText(
    "That is not a Digital ID. Scan the barcode on the Member's phone, or type the 12-digit code beneath it.",
  );
  expect(calls).toEqual([]);

  // A good scan after a bad one works straight away.
  await scan(page, await codeOnTheMembersPhone());
  await expect(page.getByRole("region", { name: "Ana Cruz Santos" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
