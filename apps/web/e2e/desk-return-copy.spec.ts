import { expect, test } from "@playwright/test";
import { LOAN_MESSAGES, RETURN_MESSAGES, SCAN_MESSAGES, formatLibraryDateTime } from "@libras/shared";
import { createDeskFixtures, scan, signInAtTheDesk } from "./desk-fixtures.ts";
import type { DeskTestCopy } from "./desk-fixtures.ts";

const desk = createDeskFixtures();
const { addBook, bookOf, codeOnThePhoneOf, copyStatus, createMember, holdsOf, loansOf, placeHold } = desk;

test.beforeAll(desk.setUp);
test.afterAll(desk.cleanUp);

/** Today as the library's calendar (Manila) writes it, "Nov 12, 2026". */
function today(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month").slice(0, 3)} ${part("day")}, ${part("year")}`;
}

test("a Librarian records a return: the Copy's barcode, then its accession number, each typed and ended with Enter", async ({ page }) => {
  const ana = await createMember("umak_student", "Ana", "Santos");
  const [first, second] = (await addBook("Returns At The Desk", 2)) as [DeskTestCopy, DeskTestCopy];
  await signInAtTheDesk(page);

  // The Member borrows both Copies through the desk, the way the real flow goes.
  await scan(page, await codeOnThePhoneOf(ana));
  await scan(page, first.barcode);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  await scan(page, second.barcode);
  await expect(page.getByRole("region", { name: "Ana Santos" }).getByTestId("desk-member-loans")).toHaveText("2 of 3");
  expect(await copyStatus(first.barcode)).toBe("on_loan");

  // With the Member done, a Copy scanned on its own is a return.
  await page.getByRole("button", { name: "Done with this Member" }).click();
  await expect(page.getByRole("region", { name: "Ana Santos" })).toHaveCount(0);
  await expect(page.getByTestId("desk-hint")).toContainText("scan a Copy to record a return");
  await expect(page.getByLabel("Scan or type a code")).toBeFocused();

  await scan(page, first.barcode);

  const notice = page.getByRole("region", { name: "Return recorded" });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Return recorded");
  await expect(notice).toContainText("Returns At The Desk");
  await expect(notice).toContainText(`Copy ${first.accessionNumber}`);
  await expect(notice.getByTestId("desk-return-member")).toHaveText("Ana Santos");
  await expect(notice.getByTestId("desk-return-date")).toHaveText(today());
  await expect(notice).not.toContainText("late");
  await expect(page.getByLabel("Scan or type a code")).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("desk-return-recorded.png") });
  expect(await copyStatus(first.barcode)).toBe("available");
  // The Member's app now has the Loan among the past ones, with its return date.
  const loans = await loansOf(ana);
  expect(loans.find((loan) => loan.accessionNumber === first.accessionNumber)?.returnedAt).not.toBeNull();
  expect(loans.find((loan) => loan.accessionNumber === second.accessionNumber)?.returnedAt).toBeNull();

  // The second Copy, its accession number typed because the barcode would not read.
  await scan(page, second.accessionNumber.toLowerCase());
  await expect(notice).toContainText(`Copy ${second.accessionNumber}`);
  expect(await copyStatus(second.barcode)).toBe("available");
  expect((await loansOf(ana)).every((loan) => loan.returnedAt !== null)).toBe(true);
});

test("a Copy that is not on Loan, or not known, gets a clear message and changes nothing", async ({ page }) => {
  const [copy] = (await addBook("Never Lent", 1)) as [DeskTestCopy];
  await signInAtTheDesk(page);
  const alert = page.getByRole("alert");

  await scan(page, copy.barcode);
  await expect(alert).toHaveText(RETURN_MESSAGES.copyNotOnLoan);
  await expect(page.getByRole("status")).toHaveText("Scan not accepted");
  await expect(page.getByRole("region", { name: "Return recorded" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("desk-return-not-on-loan.png") });
  expect(await copyStatus(copy.barcode)).toBe("available");

  await scan(page, "3999999997");
  await expect(alert).toHaveText(RETURN_MESSAGES.copyNotFound);

  // An unreadable scan never reaches the API.
  await scan(page, "31000<?>");
  await expect(alert).toHaveText(SCAN_MESSAGES.notAllowed);
});

test("a Copy returned a second time is refused, and a Copy that came back late says so", async ({ page }) => {
  const ben = await createMember("umak_student", "Ben", "Reyes");
  const [copy] = (await addBook("Back Twice", 1)) as [DeskTestCopy];
  // Ben borrowed it eight days ago: the loan period is seven days, so it is a day late.
  await desk.db.query(
    `insert into public.loans (copy_id, member_id, confirmed_by, checked_out_at, due_at)
     select c.id, $2, s.user_id, now() - interval '8 days', now() - interval '1 day'
       from public.copies c, public.staff s where c.barcode = $1 and s.role = 'librarian' limit 1`,
    [copy.barcode, ben.userId],
  );
  await desk.db.query("update public.copies set status = 'on_loan' where barcode = $1", [copy.barcode]);
  await signInAtTheDesk(page);

  await scan(page, copy.barcode);
  const notice = page.getByRole("region", { name: "Return recorded" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Returned late");
  await page.screenshot({ path: test.info().outputPath("desk-return-late.png") });

  await scan(page, copy.barcode);
  await expect(page.getByRole("alert")).toHaveText(RETURN_MESSAGES.copyNotOnLoan);
  await expect(notice).toHaveCount(0);
  expect((await loansOf(ben)).filter((loan) => loan.returnedAt !== null)).toHaveLength(1);
});

test("a returned Copy with a waiting Hold is set aside: the desk says for which Member, and only that Member can borrow it", async ({ page }) => {
  const ana = await createMember("umak_student", "Ana", "Santos");
  const ben = await createMember("umak_student", "Ben", "Reyes");
  const carla = await createMember("umak_student", "Carla", "Diaz");
  const [copy] = (await addBook("Held At The Desk", 1)) as [DeskTestCopy];
  const bookId = await bookOf(copy);
  await signInAtTheDesk(page);

  // Ana borrows the only Copy, and Ben places a Hold on the Book from his app.
  await scan(page, await codeOnThePhoneOf(ana));
  await scan(page, copy.barcode);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toBeVisible();
  await page.getByRole("button", { name: "Done with this Member" }).click();
  await placeHold(ben, bookId);

  // The Copy comes back: it is Ben's now.
  await scan(page, copy.barcode);
  const notice = page.getByRole("region", { name: "Return recorded" });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Return recorded - set aside for a Hold");
  await expect(notice.getByTestId("desk-return-member")).toHaveText("Ana Santos");
  const held = notice.getByTestId("desk-return-held");
  await expect(held).toContainText("Set aside for Ben Reyes");
  await expect(held).toContainText("Put this Copy on the hold shelf, not back on the stacks.");
  const [hold] = await holdsOf(ben);
  expect(hold?.status).toBe("ready");
  await expect(held.getByTestId("desk-return-held-until")).toHaveText(formatLibraryDateTime(hold?.pickupEndsAt ?? ""));
  await page.screenshot({ path: test.info().outputPath("desk-return-set-aside.png") });
  expect(await copyStatus(copy.barcode)).toBe("set_aside");

  // Another Member cannot borrow it, and the desk says why.
  await scan(page, await codeOnThePhoneOf(carla));
  await scan(page, copy.barcode);
  await expect(page.getByRole("alert")).toHaveText(LOAN_MESSAGES.copySetAside);
  await page.screenshot({ path: test.info().outputPath("desk-loan-set-aside-refused.png") });
  expect(await loansOf(carla)).toHaveLength(0);
  await page.getByRole("button", { name: "Done with this Member" }).click();

  // Ben can: the Loan is confirmed and his Hold is fulfilled.
  await scan(page, await codeOnThePhoneOf(ben));
  await scan(page, copy.barcode);
  await expect(page.getByRole("region", { name: "Loan confirmed" })).toContainText("Held At The Desk");
  expect((await holdsOf(ben))[0]?.status).toBe("fulfilled");
  expect(await copyStatus(copy.barcode)).toBe("on_loan");
});
