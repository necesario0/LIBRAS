import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import type {
  ConfirmLoanResponse,
  CopyStatus,
  DigitalIdResponse,
  IdentifyMemberResponse,
  MyLoansResponse,
  RecordReturnResponse,
  ReturnedLoan,
} from "@libras/shared";
import { createTestAccount, startTestApi } from "../src/testing/index.ts";
import type { TestApi, TestMember } from "../src/testing/index.ts";

export type { CopyStatus };

export interface TestCopy {
  id: string;
  barcode: string;
  accessionNumber: string;
}

export interface TestBook {
  id: string;
  title: string;
  copies: TestCopy[];
}

export interface TestLibrarian {
  userId: string;
  accessToken: string;
}

/** What every group of Loan tests does: add Books with Copies, sign Librarians in, call the API, clean up. */
export function loansHarness() {
  const bookIds: string[] = [];
  const state: { api?: TestApi } = {};
  const api = () => {
    if (!state.api) throw new Error("The API is not started");
    return state.api;
  };
  const send = (method: string, path: string, token: string | null, body?: unknown) =>
    fetch(`${api().baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** The code on the Member's phone right now, from the real endpoint. */
  const digitalIdOf = async (member: TestMember): Promise<string> => {
    const response = await send("GET", "/members/me/digital-id", member.accessToken);
    assert.equal(response.status, 200);
    return ((await response.json()) as DigitalIdResponse).code;
  };
  /** The Librarian scans a Digital ID at the desk. */
  const identify = (librarian: TestLibrarian, code: string) => send("POST", "/desk/members/identify", librarian.accessToken, { code });
  /** The Librarian scans the Member's Digital ID: the token of the desk session that lends to them. */
  const deskSessionFor = async (member: TestMember, librarian: TestLibrarian): Promise<string> => {
    const response = await identify(librarian, await digitalIdOf(member));
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as IdentifyMemberResponse).deskSession.token;
  };
  /** The Librarian scans the Member's Digital ID: the Member as the desk shows them, and the desk session that lends to them. */
  const identifyAtDesk = async (librarian: TestLibrarian, member: TestMember): Promise<IdentifyMemberResponse> => {
    const response = await identify(librarian, await digitalIdOf(member));
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as IdentifyMemberResponse;
  };
  /** A moment in Manila, "2026-11-20 00:00", as the API's clock takes it. */
  const at = (manila: string) => api().clock.set(new Date(`${manila.replace(" ", "T")}:00.000+08:00`).toISOString());
  /** The Librarian scans a Copy for the Member of a desk session. */
  const lendWith = (librarian: TestLibrarian, deskSession: string, copy: string) =>
    send("POST", "/desk/loans", librarian.accessToken, { deskSession, copy });

  /** A Book whose Copies have these statuses, with a ten-digit barcode and an accession number each. */
  const addBook = async (title: string, copyStatuses: CopyStatus[] = ["available"]): Promise<TestBook> => {
    const { rows } = await api().db.query("insert into public.books (title, authors) values ($1, $2) returning id", [title, ["Reyes, Ana"]]);
    const id: string = rows[0].id;
    bookIds.push(id);
    const copies: TestCopy[] = [];
    for (const status of copyStatuses) {
      const barcode = `39${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
      const accessionNumber = `LT-${randomUUID().slice(0, 13).toUpperCase()}`;
      const inserted = await api().db.query(
        "insert into public.copies (book_id, accession_number, barcode, status) values ($1, $2, $3, $4) returning id",
        [id, accessionNumber, barcode, status],
      );
      copies.push({ id: inserted.rows[0].id, barcode, accessionNumber });
    }
    return { id, title, copies };
  };

  return {
    api,
    addBook,
    send,
    digitalIdOf,
    identify,
    deskSessionFor,
    identifyAtDesk,
    at,
    lendWith,
    /** The Librarian scans the Member's Digital ID, then the Copy: one visit to the desk. */
    lendAtDesk: async (librarian: TestLibrarian, member: TestMember, copy: string) =>
      lendWith(librarian, await deskSessionFor(member, librarian), copy),
    /** "Done with this Member": the desk session ends. */
    endDeskSession: (librarian: TestLibrarian, deskSession: string) =>
      send("POST", "/desk/sessions/end", librarian.accessToken, { deskSession }),
    /**
     * A Member borrows a new Copy on 12 Nov at 10:00 in Manila (due the end of 19 Nov), and the Librarian records
     * its return `daysLate` days after the due date, at 15:00 Manila time: a late return with a Fine.
     */
    lateReturn: async (librarian: TestLibrarian, member: TestMember, daysLate = 2): Promise<ReturnedLoan> => {
      const copy = (await addBook("Settle Me")).copies[0] as TestCopy;
      api().clock.set("2026-11-12T02:00:00.000Z");
      const lent = await lendWith(librarian, await deskSessionFor(member, librarian), copy.barcode);
      assert.equal(lent.status, 201);
      const { loan } = (await lent.json()) as ConfirmLoanResponse;
      at(`2026-11-${19 + daysLate} 15:00`);
      const response = await send("POST", "/desk/returns", librarian.accessToken, { copy: copy.barcode });
      assert.equal(response.status, 200, await response.clone().text());
      const returned = ((await response.json()) as RecordReturnResponse).loan;
      assert.equal(returned.id, loan.id);
      return returned;
    },
    start: async (options: Parameters<typeof startTestApi>[0] = {}) => {
      state.api = await startTestApi(options);
    },
    stop: async () => {
      try {
        await api().db.query("delete from public.holds where book_id = any($1)", [bookIds]);
        await api().db.query(
          "delete from public.loans where copy_id in (select id from public.copies where book_id = any($1))",
          [bookIds],
        );
        await api().db.query("delete from public.copies where book_id = any($1)", [bookIds]);
        await api().db.query("delete from public.books where id = any($1)", [bookIds]);
      } finally {
        await api().close();
      }
    },
    librarian: async (fullName = "Lita Reyes"): Promise<TestLibrarian> => {
      const account = await createTestAccount(api(), { staff: { role: "librarian", fullName } });
      const signedIn = await send("POST", "/staff/sign-in", null, { email: account.email, password: account.password });
      const { session } = (await signedIn.json()) as { session: { accessToken: string } };
      return { userId: account.userId, accessToken: session.accessToken };
    },
    myLoans: async (member: TestMember) => {
      const response = await send("GET", "/members/me/loans", member.accessToken);
      assert.equal(response.status, 200);
      return (await response.json()) as MyLoansResponse;
    },
    loansOf: async (member: TestMember) => {
      const response = await send("GET", "/members/me/loans", member.accessToken);
      assert.equal(response.status, 200);
      return ((await response.json()) as MyLoansResponse).loans;
    },
  };
}

export async function refusal(response: Response): Promise<{ status: number; code: string; message: string }> {
  const { error } = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status, code: error.code, message: error.message };
}
