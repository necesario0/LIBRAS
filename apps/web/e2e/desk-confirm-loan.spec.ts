import { expect, test } from "@playwright/test";
import { LOAN_MESSAGES, RETURN_MESSAGES, SCAN_MESSAGES } from "@libras/shared";
import { createDeskFixtures, scan, signInAtTheDesk } from "./desk-fixtures.ts";
import type { DeskTestCopy } from "./desk-fixtures.ts";

const desk = createDeskFixtures();
const { addBook, codeOnThePhoneOf, createMember, db, loansOf } = desk;

test.beforeAll(desk.setUp);
test.afterAll(desk.cleanUp);

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

test("a Copy scanned before any Digital ID is a return, never a Loan", async ({ page }) => {
  const [copy] = (await addBook("Nobody At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/desk/")) calls.push(request.url());
  });

  await scan(page, copy.barcode);

  // The Copy is on the shelf, so there is nothing to return, and nothing is lent.
  await expect(page.getByRole("alert")).toHaveText(RETURN_MESSAGES.copyNotOnLoan);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("/desk/returns");
  const { rows } = await db.query("select status from public.copies where barcode = $1", [copy.barcode]);
  expect(rows[0].status).toBe("available");
});

test("a Copy scanned minutes after the Digital ID is still lent: the desk session outlives the code", async ({ page }) => {
  // The code on the Member's phone is accepted for at most two minutes. The desk session lasts ten.
  test.setTimeout(240_000);
  const dan = await createMember("umak_student", "Dan", "Ong");
  const [copy] = (await addBook("Slow At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  await scan(page, await codeOnThePhoneOf(dan));
  await expect(page.getByRole("region", { name: "Dan Ong" })).toBeVisible();

  // The Member looks for the Book on the shelves while the Librarian waits: the code they showed has expired.
  await page.waitForTimeout(125_000);
  await scan(page, copy.barcode);

  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dan Ong" }).getByTestId("desk-member-loans")).toHaveText("1 of 3");
  expect(await loansOf(dan)).toHaveLength(1);
});

test("a desk session that has timed out asks for the Digital ID again, and the next scan of it works", async ({ page }) => {
  const fay = await createMember("umak_student", "Fay", "Go");
  const [copy] = (await addBook("Timed Out At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  await scan(page, await codeOnThePhoneOf(fay));
  await expect(page.getByRole("region", { name: "Fay Go" })).toBeVisible();

  // Ten minutes pass with nothing scanned for Fay.
  await db.query("update public.desk_sessions set expires_at = now() - interval '1 second' where member_id = $1", [fay.userId]);
  await scan(page, copy.barcode);

  await expect(page.getByRole("alert")).toHaveText(LOAN_MESSAGES.deskSessionEnded);
  await expect(page.getByRole("region", { name: "Fay Go" })).toHaveCount(0);
  await expect(page.getByTestId("desk-hint")).toContainText("Scan a Member's Digital ID");
  await page.screenshot({ path: test.info().outputPath("desk-session-ended.png") });
  expect(await loansOf(fay)).toEqual([]);

  await scan(page, await codeOnThePhoneOf(fay));
  await scan(page, copy.barcode);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  expect(await loansOf(fay)).toHaveLength(1);
});

test("Done with this Member ends the desk session at once", async ({ page }) => {
  const gil = await createMember("umak_student", "Gil", "Uy");
  await signInAtTheDesk(page);
  await scan(page, await codeOnThePhoneOf(gil));
  await expect(page.getByRole("region", { name: "Gil Uy" })).toBeVisible();
  const live = async () =>
    ((await db.query("select count(*)::int as count from public.desk_sessions where member_id = $1 and ended_at is null", [gil.userId])).rows[0] as {
      count: number;
    }).count;
  expect(await live()).toBe(1);

  await page.getByRole("button", { name: "Done with this Member" }).click();

  await expect(page.getByRole("region", { name: "Gil Uy" })).toHaveCount(0);
  await expect.poll(live).toBe(0);
});

test("a Copy scanned before the Digital ID has been checked still confirms the Loan", async ({ page }) => {
  const eve = await createMember("umak_student", "Eve", "Tan");
  const [copy] = (await addBook("Quick At The Desk", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  // The API takes a moment to check the Digital ID, and the scanner does not wait for it.
  await page.route("**/desk/members/identify", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  await scan(page, await codeOnThePhoneOf(eve));
  await scan(page, copy.barcode);

  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Eve Tan" }).getByTestId("desk-member-loans")).toHaveText("1 of 3");
  expect(await loansOf(eve)).toHaveLength(1);
});
