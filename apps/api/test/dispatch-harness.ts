import assert from "node:assert/strict";
import type { AccountType, BookDetailResponse, Hold, MyHoldsResponse, PlaceHoldResponse, RecordReturnResponse } from "@libras/shared";
import { createTestMemberFromSignUp, facultySignUpBody, ntpEmployeeSignUpBody } from "../src/testing/index.ts";
import type { TestMember } from "../src/testing/index.ts";
import { loansHarness } from "./loans-harness.ts";
import type { CopyStatus, TestBook, TestLibrarian } from "./loans-harness.ts";

/** What the Hold dispatch tests do on top of the Loan tests' harness: lend, give back, place and read Holds. */
export function dispatchHarness() {
  const h = loansHarness();
  const state: { librarian?: TestLibrarian } = {};
  const lita = () => {
    if (!state.librarian) throw new Error("No Librarian is signed in");
    return state.librarian;
  };
  const lendRequest = async (member: TestMember, copy: string, librarian = lita()) =>
    h.send("POST", "/desk/loans", librarian.accessToken, { digitalId: await h.digitalIdOf(member), copy });
  const lend = async (member: TestMember, copy: string) => {
    const response = await lendRequest(member, copy);
    assert.equal(response.status, 201, await response.clone().text());
  };
  const giveBackRequest = (copy: string, librarian = lita()) => h.send("POST", "/desk/returns", librarian.accessToken, { copy });
  const giveBack = async (copy: string) => {
    const response = await giveBackRequest(copy);
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as RecordReturnResponse).loan;
  };

  const placeHold = async (member: TestMember, bookId: string): Promise<Hold> => {
    const response = await h.send("POST", "/holds", member.accessToken, { bookId });
    assert.equal(response.status, 201, await response.clone().text());
    return ((await response.json()) as PlaceHoldResponse).hold;
  };

  return {
    ...h,
    lita,
    start: async () => {
      await h.start();
      state.librarian = await h.librarian();
    },
    lendRequest,
    lend,
    giveBackRequest,
    giveBack,
    /** A Book whose Copies are all out with `borrower`: the only way a Hold can be placed on it. */
    lentBook: async (title: string, borrower: TestMember, copies = 1): Promise<TestBook> => {
      const book = await h.addBook(title, Array<CopyStatus>(copies).fill("available"));
      for (const copy of book.copies) await lend(borrower, copy.barcode);
      return book;
    },
    placeHoldRequest: (member: TestMember, bookId: string) => h.send("POST", "/holds", member.accessToken, { bookId }),
    placeHold,
    cancelHold: (member: TestMember, holdId: string) => h.send("POST", `/holds/${holdId}/cancel`, member.accessToken),
    holdsOf: async (member: TestMember): Promise<Hold[]> => {
      const response = await h.send("GET", "/members/me/holds", member.accessToken);
      assert.equal(response.status, 200);
      return ((await response.json()) as MyHoldsResponse).holds;
    },
    holdOn: async (member: TestMember, bookId: string): Promise<Hold> => {
      const response = await h.send("GET", "/members/me/holds", member.accessToken);
      const hold = ((await response.json()) as MyHoldsResponse).holds.find((candidate) => candidate.bookId === bookId);
      assert.ok(hold, "the Member has no Hold on that Book");
      return hold;
    },
    availableCopies: async (member: TestMember, bookId: string): Promise<number> => {
      const response = await h.send("GET", `/catalog/books/${bookId}`, member.accessToken);
      assert.equal(response.status, 200);
      return ((await response.json()) as BookDetailResponse).book.availableCopies;
    },
    /** A Faculty or NTP / Employee Member, signed up through the API, with a Hold placed through `POST /holds`. */
    memberWithHold: async (accountType: Extract<AccountType, "faculty" | "ntp_employee">, firstName: string, bookId: string) => {
      const body = { firstName, lastName: "Garcia" };
      const member = await createTestMemberFromSignUp(
        h.api(),
        accountType === "faculty" ? facultySignUpBody(body) : ntpEmployeeSignUpBody(body),
      );
      await placeHold(member, bookId);
      return { email: member.email, name: `${firstName} Garcia` };
    },
  };
}
