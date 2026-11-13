import { randomInt, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AccountType, MyHoldsResponse, MyLoansResponse } from "@libras/shared";
import { createTestAccount, signInDirect } from "@libras/api/testing";
import { loadConfig } from "../../api/src/config.ts";
import { createDatabase } from "../../api/src/db.ts";
import { currentDigitalId } from "../../api/src/digital-id/index.ts";
import { seedLibrarians } from "../../api/src/seed/librarians.ts";

/** The API Playwright starts (playwright.config.ts). */
const API_URL = "http://127.0.0.1:3101";

export const librarian = { email: "e2e-librarian@libras.test", password: "e2e-librarian-pw-1", fullName: "Lita Reyes" };

export interface DeskTestMember {
  userId: string;
  fullName: string;
  accessToken: string;
}

export interface DeskTestCopy {
  barcode: string;
  accessionNumber: string;
}

/** What a USB barcode scanner does: types the characters into the focused page and presses Enter. */
export async function scan(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

export async function signInAtTheDesk(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(librarian.email);
  await page.getByLabel("Password", { exact: true }).fill(librarian.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Ready for scanning" })).toBeVisible();
}

/**
 * What a desk spec file needs: the local database (the one the API under test
 * uses), Members and Books it can make, and a clean-up of everything it made.
 * Each spec file makes its own, so one file closing its connection does not
 * break another.
 */
export function createDeskFixtures() {
  const db = createDatabase(loadConfig().databaseUrl, console);
  const bookIds: string[] = [];

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

  return {
    db,
    setUp: () => seedLibrarians(db, [librarian]),
    /** Removes the Books, Copies and Loans this file made, and closes the connection. */
    cleanUp: async () => {
      await db.query("delete from public.holds where book_id = any($1)", [bookIds]);
      await db.query("delete from public.loans where copy_id in (select id from public.copies where book_id = any($1))", [bookIds]);
      await db.query("delete from public.copies where book_id = any($1)", [bookIds]);
      await db.query("delete from public.books where id = any($1)", [bookIds]);
      await db.end();
    },
    createMember,
    addBook,
    /** The id of the Book a Copy belongs to. */
    bookOf: async (copy: DeskTestCopy): Promise<string> =>
      ((await db.query("select book_id from public.copies where barcode = $1", [copy.barcode])).rows[0] as { book_id: string }).book_id,
    /** The Member places a Hold from their app: the real endpoint. */
    placeHold: async (member: DeskTestMember, bookId: string): Promise<void> => {
      const response = await fetch(`${API_URL}/holds`, {
        method: "POST",
        headers: { authorization: `Bearer ${member.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      expect(response.status).toBe(201);
    },
    /** What the Member's app reads: their own Holds, from the real endpoint. */
    holdsOf: async (member: DeskTestMember) => {
      const response = await fetch(`${API_URL}/members/me/holds`, { headers: { authorization: `Bearer ${member.accessToken}` } });
      expect(response.status).toBe(200);
      return ((await response.json()) as MyHoldsResponse).holds;
    },
    /** The code the Member's app shows right now. */
    codeOnThePhoneOf: async (member: DeskTestMember): Promise<string> =>
      (await currentDigitalId({ db, clock: { now: () => new Date() } }, member.userId)).code,
    /** What the Member's app reads: their own Loans, from the real endpoint. */
    loansOf: async (member: DeskTestMember) => {
      const response = await fetch(`${API_URL}/members/me/loans`, { headers: { authorization: `Bearer ${member.accessToken}` } });
      expect(response.status).toBe(200);
      return ((await response.json()) as MyLoansResponse).loans;
    },
    copyStatus: async (barcode: string): Promise<string> =>
      ((await db.query("select status from public.copies where barcode = $1", [barcode])).rows[0] as { status: string }).status,
  };
}
