import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { LOAN_MESSAGES, SCAN_MESSAGES } from "@libras/shared";
import type { AccountType, MyLoansResponse } from "@libras/shared";
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
const bookIds: string[] = [];

interface DeskTestMember {
  userId: string;
  fullName: string;
  accessToken: string;
}

interface DeskTestCopy {
  barcode: string;
  accessionNumber: string;
}

/** A Member as sign-up leaves one, signed in so the test can read what their app would show. */
async function createMember(accountType: AccountType, firstName: string, lastName: string): Promise<DeskTestMember> {
  const account = await createTestAccount({ db });
  const unique = randomUUID().replaceAll("-", "").slice(0, 10);
  const details = accountType === "umak_student" ? { studentNumber: `K${randomInt(10_000_000, 99_999_999)}`, college: "CCIS" } : {};
  await db.query(
    `insert into public.members (user_id, account_type, first_name, last_name, username, details, terms_accepted_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [account.userId, accountType, firstName, lastName, `${firstName.toLowerCase()}_${unique}`, JSON.stringify(details)],
  );
  const accessToken = await signInDirect(account.email, account.password);
  if (accessToken === undefined) throw new Error("The test Member could not sign in");
  return { userId: account.userId, fullName: `${firstName} ${lastName}`, accessToken };
}

/** A Book with this many Copies on the shelf, each with a ten-digit barcode and an accession number. */
async function addBook(title: string, copies: number): Promise<DeskTestCopy[]> {
  const { rows } = await db.query<{ id: string }>("insert into public.books (title, authors) values ($1, $2) returning id", [
    title,
    ["Reyes, Ana"],
  ]);
  const id = (rows[0] as { id: string }).id;
  bookIds.push(id);
  const added: DeskTestCopy[] = [];
  for (let i = 0; i < copies; i += 1) {
    const copy = {
      barcode: `38${String(randomInt(0, 100_000_000)).padStart(8, "0")}`,
      accessionNumber: `DK-${randomUUID().slice(0, 8).toUpperCase()}`,
    };
    await db.query("insert into public.copies (book_id, accession_number, barcode) values ($1, $2, $3)", [id, copy.accessionNumber, copy.barcode]);
    added.push(copy);
  }
  return added;
}

test.beforeAll(async () => {
  await seedLibrarians(db, [librarian]);
});
test.afterAll(async () => {
  await db.query("delete from public.loans where copy_id in (select id from public.copies where book_id = any($1))", [bookIds]);
  await db.query("delete from public.copies where book_id = any($1)", [bookIds]);
  await db.query("delete from public.books where id = any($1)", [bookIds]);
  await db.end();
});

/** The code the Member's app shows right now. */
async function codeOnThePhoneOf(member: DeskTestMember): Promise<string> {
  return (await currentDigitalId({ db, clock: { now: () => new Date() } }, member.userId)).code;
}

/** What the Member's app reads: their own Loans, from the real endpoint. */
async function loansOf(member: DeskTestMember) {
  const response = await fetch(`${API_URL}/members/me/loans`, { headers: { authorization: `Bearer ${member.accessToken}` } });
  expect(response.status).toBe(200);
  return ((await response.json()) as MyLoansResponse).loans;
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

/** The day a Loan confirmed now is due: seven days on, as the library's calendar (Manila) writes it. */
function dueDateOfALoanConfirmedNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" }).formatToParts(
    new Date(Date.now() + 7 * 24 * 3_600_000),
  );
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month").slice(0, 3)} ${part("day")}, ${part("year")}`;
}

test("a Librarian confirms a Loan: the Digital ID, then the Copy, each typed and ended with Enter", async ({ page }) => {
  const ana = await createMember("umak_student", "Ana", "Santos");
  const [first, second] = (await addBook("Algorithms At The Desk", 2)) as [DeskTestCopy, DeskTestCopy];
  await signInAtTheDesk(page);

  await scan(page, await codeOnThePhoneOf(ana));
  const card = page.getByRole("region", { name: "Ana Santos" });
  await expect(card.getByTestId("desk-member-loans")).toHaveText("0 of 3");
  // The desk now asks for the Copy, and the scan field has the focus again.
  await expect(page.getByTestId("desk-hint")).toContainText("Scan the Copy's barcode");
  await expect(page.getByLabel("Scan or type a code")).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("desk-loan-member.png") });

  await scan(page, first.barcode);

  const notice = page.getByRole("region", { name: "Loan confirmed" });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Loan confirmed");
  await expect(notice).toContainText("Algorithms At The Desk");
  await expect(notice).toContainText(`Copy ${first.accessionNumber}`);
  await expect(notice.getByTestId("desk-loan-due")).toHaveText(dueDateOfALoanConfirmedNow());
  await expect(card.getByTestId("desk-member-loans")).toHaveText("1 of 3");
  await expect(page.getByLabel("Scan or type a code")).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("desk-loan-confirmed.png") });
  // The Member's app now has the Loan.
  expect((await loansOf(ana)).map((loan) => [loan.bookTitle, loan.accessionNumber])).toEqual([["Algorithms At The Desk", first.accessionNumber]]);

  // A second Copy in the same visit, its accession number typed because the barcode would not read.
  await scan(page, second.accessionNumber.toLowerCase());
  await expect(notice).toContainText(`Copy ${second.accessionNumber}`);
  await expect(card.getByTestId("desk-member-loans")).toHaveText("2 of 3");
  expect(await loansOf(ana)).toHaveLength(2);
});

test("a refused Loan shows its reason and keeps the Member at the desk", async ({ page }) => {
  const ben = await createMember("umak_student", "Ben", "Reyes");
  const cara = await createMember("umak_student", "Cara", "Lim");
  const copies = await addBook("Refusals At The Desk", 5);
  const [one, two, three, four, five] = copies as [DeskTestCopy, DeskTestCopy, DeskTestCopy, DeskTestCopy, DeskTestCopy];
  await signInAtTheDesk(page);
  const alert = page.getByRole("alert");
  const bensCard = page.getByRole("region", { name: "Ben Reyes" });

  // A barcode that belongs to no Copy.
  await scan(page, await codeOnThePhoneOf(ben));
  await expect(bensCard).toBeVisible();
  await scan(page, "3999999997");
  await expect(alert).toHaveText(LOAN_MESSAGES.copyNotFound);
  await expect(page.getByRole("status")).toHaveText("Scan not accepted");
  await expect(bensCard).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desk-loan-unknown-copy.png") });

  // An unreadable scan: characters no LIBRAS barcode has. It never reaches the API.
  await scan(page, "31000<?>");
  await expect(alert).toHaveText(SCAN_MESSAGES.notAllowed);
  await expect(bensCard).toBeVisible();

  // The accession number typed instead works straight after.
  await scan(page, one.accessionNumber);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  await expect(alert).toHaveCount(0);

  // A Copy that is already on Loan, scanned for another Member.
  await scan(page, await codeOnThePhoneOf(cara));
  await expect(page.getByRole("region", { name: "Cara Lim" })).toBeVisible();
  await scan(page, one.barcode);
  await expect(alert).toHaveText(LOAN_MESSAGES.copyOnLoan);
  await expect(page.getByRole("region", { name: "Cara Lim" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("desk-loan-copy-on-loan.png") });
  expect(await loansOf(cara)).toEqual([]);

  // The loan limit: Ben's fourth Copy.
  await scan(page, await codeOnThePhoneOf(ben));
  await scan(page, two.barcode);
  await expect(bensCard.getByTestId("desk-member-loans")).toHaveText("2 of 3");
  await scan(page, three.barcode);
  await expect(bensCard.getByTestId("desk-member-loans")).toHaveText("3 of 3");
  await expect(bensCard).toContainText("Loan limit reached");
  await scan(page, four.barcode);
  await expect(alert).toHaveText(LOAN_MESSAGES.limitReached);
  await expect(bensCard.getByTestId("desk-member-loans")).toHaveText("3 of 3");
  await page.screenshot({ path: test.info().outputPath("desk-loan-limit.png") });
  expect(await loansOf(ben)).toHaveLength(3);

  // A Visitor cannot borrow.
  const vida = await createMember("visitor", "Vida", "Cruz");
  await scan(page, await codeOnThePhoneOf(vida));
  const vidasCard = page.getByRole("region", { name: "Vida Cruz" });
  await expect(vidasCard.getByTestId("desk-member-loans")).toHaveText("Cannot borrow");
  await scan(page, five.barcode);
  await expect(alert).toHaveText(LOAN_MESSAGES.cannotBorrow);
  await expect(vidasCard).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desk-loan-cannot-borrow.png") });
});

test("a Copy scanned before any Digital ID confirms nothing", async ({ page }) => {
  const [copy] = (await addBook("Nobody At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/desk/")) calls.push(request.url());
  });

  await scan(page, copy.barcode);

  await expect(page.getByRole("alert")).toHaveText(SCAN_MESSAGES.notDigitalId);
  expect(calls).toEqual([]);
  const { rows } = await db.query("select status from public.copies where barcode = $1", [copy.barcode]);
  expect(rows[0].status).toBe("available");
});

test("a Digital ID that expires while the Member is at the desk must be shown again", async ({ page }) => {
  const dan = await createMember("umak_student", "Dan", "Ong");
  const [copy] = (await addBook("Slow At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  await scan(page, await codeOnThePhoneOf(dan));
  await expect(page.getByRole("region", { name: "Dan Ong" })).toBeVisible();

  // The desk still holds the code it scanned. Three minutes later the API no longer accepts it.
  await page.route("**/desk/loans", async (route) => {
    const threeMinutesAgo = { now: () => new Date(Date.now() - 3 * 60_000) };
    const { code } = await currentDigitalId({ db, clock: threeMinutesAgo }, dan.userId);
    await route.continue({ postData: JSON.stringify({ ...(route.request().postDataJSON() as object), digitalId: code }) });
  });
  await scan(page, copy.barcode);

  await expect(page.getByRole("alert")).toHaveText("This Digital ID has expired. Ask the Member to show the code on their screen now.");
  await expect(page.getByRole("region", { name: "Dan Ong" })).toHaveCount(0);
  await expect(page.getByTestId("desk-hint")).toContainText("Scan a Member's Digital ID");
  expect(await loansOf(dan)).toEqual([]);
});
