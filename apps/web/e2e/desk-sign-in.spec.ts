import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createTestAccount } from "@libras/api/testing";
import { loadConfig } from "../../api/src/config.ts";
import { createDatabase } from "../../api/src/db.ts";
import { seedLibrarians } from "../../api/src/seed/librarians.ts";

// The same database the API under test uses: `loadConfig` gives the local Supabase one.
const db = createDatabase(loadConfig().databaseUrl, console);

const librarian = { email: "e2e-librarian@libras.test", password: "e2e-librarian-pw-1", fullName: "Lita Reyes" };

test.beforeAll(async () => {
  // The seed script's own code path: a Librarian exists the way it does in the demo.
  await seedLibrarians(db, [librarian]);
});
test.afterAll(() => db.end());

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the seeded Librarian signs in, reaches the desk screen, and signs out", async ({ page }) => {
  await signInAs(page, librarian.email, librarian.password);

  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toBeVisible();
  await expect(page.getByText("Lita Reyes")).toBeVisible();

  // The session survives a reload at the desk.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Librarian desk" })).toBeVisible();

  // Signed out means signed out: a reload does not bring the desk back.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Librarian desk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toHaveCount(0);
});

test("a Member account is refused with a clear message", async ({ page }) => {
  const member = await createTestAccount({ db });

  await signInAs(page, member.email, member.password);

  await expect(page.getByRole("alert")).toContainText("library staff only");
  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toHaveCount(0);
});

test("wrong credentials show one error that does not say which field was wrong", async ({ page }) => {
  await signInAs(page, librarian.email, "not-the-password");
  const wrongPassword = await page.getByRole("alert").innerText();

  await signInAs(page, "nobody@libras.test", "not-the-password");
  const unknownEmail = await page.getByRole("alert").innerText();

  expect(wrongPassword).toBe("The email or password is incorrect.");
  expect(unknownEmail).toBe(wrongPassword);
});

test("an empty form asks for both fields without calling the API", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter your email and password.");
});
