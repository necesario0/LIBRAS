import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { TestMember } from "../src/testing/index.ts";
import { createAuditLog } from "../src/audit/index.ts";
import { createTestMember, createTestMemberFromSignUp, startTestApi, studentSignUpBody } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";
import { dispatchHarness } from "./dispatch-harness.ts";
import { refusal } from "./loans-harness.ts";

interface Session {
  accessToken: string;
  refreshToken: string;
}

function sender(api: () => TestApi) {
  const send = (method: string, path: string, body?: unknown, accessToken?: string) =>
    fetch(`${api().baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    send,
    /** Delete my account, confirmed with `password`. */
    deleteAccount: (member: TestMember, password = member.password, accessToken = member.accessToken) =>
      send("POST", "/members/me/delete", { password }, accessToken),
    signIn: (member: Pick<TestMember, "email" | "password">) =>
      send("POST", "/members/sign-in", { email: member.email, password: member.password }),
    me: (accessToken: string) => send("GET", "/members/me", undefined, accessToken),
    /** Signs in through the API, as the app does: a new session of the account. */
    signInPhone: async (member: TestMember): Promise<Session> => {
      const response = await send("POST", "/members/sign-in", { email: member.email, password: member.password });
      assert.equal(response.status, 200, await response.clone().text());
      return ((await response.json()) as { session: Session }).session;
    },
  };
}

/** The Member record and what is left of the Member's other rows, read straight from the database. */
async function leftOf(api: TestApi, memberId: string) {
  const { rows } = await api.db.query(
    `select to_jsonb(m) - 'user_id' - 'created_at' - 'terms_accepted_at' - 'deleted_at' as record,
            m.deleted_at,
            (select count(*)::int from auth.users u where u.id = $1) as sign_ins,
            (select count(*)::int from public.saved_books s where s.member_id = $1) as saved_books,
            (select count(*)::int from public.digital_id_secrets d where d.member_id = $1) as digital_ids,
            (select count(*)::int from public.loans l where l.member_id = $1) as loans,
            (select count(*)::int from public.fines f where f.member_id = $1) as fines,
            (select coalesce(jsonb_agg(h.status order by h.placed_at), '[]') from public.holds h where h.member_id = $1) as holds
       from public.members m where m.user_id = $1`,
    [memberId],
  );
  return rows[0] as
    | { record: Record<string, unknown>; deleted_at: Date | null; sign_ins: number; saved_books: number; digital_ids: number; loans: number; fines: number; holds: string[] }
    | undefined;
}

describe("Delete my account", () => {
  const h = dispatchHarness();
  const { send, deleteAccount, signIn, me, signInPhone } = sender(h.api);

  before(() => h.start());
  after(() => h.stop());

  it("is refused with the Clearance reason while a Loan is out, and the account stays", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Clean Code");
    await h.lend(member, book.copies[0]?.barcode as string);

    const response = await deleteAccount(member);

    assert.deepEqual(await refusal(response), {
      status: 409,
      code: "not_cleared",
      message: "You can delete your account once you are cleared. You still have 1 Loan out: Clean Code.",
    });
    assert.equal((await me(member.accessToken)).status, 200);
    assert.equal((await signIn(member)).status, 200);
  });

  it("is refused with the Clearance reason while a Fine is unsettled", async () => {
    const member = await createTestMember(h.api());
    await h.lateReturn(h.lita(), member, 2);

    const response = await deleteAccount(member);

    assert.deepEqual(await refusal(response), {
      status: 409,
      code: "not_cleared",
      message: "You can delete your account once you are cleared. You still have an unsettled Fine of PHP 10. Settle it at the library desk.",
    });
    assert.equal((await me(member.accessToken)).status, 200);
  });

  it("deletes a cleared Member: no sign-in, no session, no Saved books, no personal data, and their Loans and Fines kept", async () => {
    const member = await createTestMember(h.api());
    const returned = await h.lateReturn(h.lita(), member, 2);
    const settled = await h.send("POST", "/desk/fines/settle", h.lita().accessToken, { place: "return", loan: returned.id, outcome: "paid" });
    assert.equal(settled.status, 200, await settled.clone().text());
    const saved = await h.addBook("Saved Then Deleted");
    assert.equal((await send("PUT", `/members/me/saved-books/${saved.id}`, undefined, member.accessToken)).status, 200);
    const phone = await signInPhone(member);
    const otherPhone = await signInPhone(member);

    const response = await deleteAccount(member, member.password, phone.accessToken);

    assert.equal(response.status, 204, await response.clone().text());
    assert.equal((await refusal(await signIn(member))).code, "invalid_credentials", "the sign-in is gone");
    for (const token of [phone.accessToken, otherPhone.accessToken, member.accessToken]) {
      assert.equal((await me(token)).status, 401, "every old access token is refused");
    }
    for (const token of [phone.refreshToken, otherPhone.refreshToken]) {
      assert.equal((await send("POST", "/auth/refresh", { refreshToken: token })).status, 401, "no session can be renewed");
    }
    assert.deepEqual(await leftOf(h.api(), member.member.id), {
      record: {
        account_type: "umak_student",
        first_name: null,
        middle_name: null,
        last_name: null,
        username: null,
        contact_number: null,
        details: {},
      },
      deleted_at: h.api().clock.now(),
      sign_ins: 0,
      saved_books: 0,
      digital_ids: 0,
      loans: 1,
      fines: 1,
      holds: [],
    });
  });

  it("frees the email, username and student number for a new sign-up", async () => {
    const body = studentSignUpBody();
    const member = await createTestMemberFromSignUp(h.api(), body);
    assert.equal((await deleteAccount(member)).status, 204);

    const again = await createTestMemberFromSignUp(h.api(), { ...body, password: `${body.password}-new` });

    assert.notEqual(again.member.id, member.member.id, "a new account, not the old one back");
    assert.equal(again.member.username, body.username);
  });

  it("cancels the Member's Holds, and a ready Hold's Copy goes to the next waiting Hold", async () => {
    const reader = await createTestMember(h.api());
    const leaving = await createTestMember(h.api());
    const next = await createTestMember(h.api());
    const book = await h.lentBook("Passed On", reader);
    const other = await h.lentBook("Still Waiting", reader);
    await h.placeHold(leaving, book.id);
    await h.placeHold(next, book.id);
    await h.placeHold(leaving, other.id);
    await h.giveBack(book.copies[0]?.barcode as string);
    assert.equal((await h.holdOn(leaving, book.id)).status, "ready");
    h.api().emails.clear();

    assert.equal((await deleteAccount(leaving)).status, 204);

    assert.equal((await h.holdOn(next, book.id)).status, "ready", "the next waiting Hold gets the Copy");
    assert.equal(h.api().emails.lastTo(next.email)?.subject, "Your LIBRAS Hold is ready for pickup");
    await h.assertConsistent(book.id);
    assert.deepEqual((await leftOf(h.api(), leaving.member.id))?.holds, ["cancelled", "cancelled"]);
  });

  it("makes a Copy available when nobody else waits for it", async () => {
    const reader = await createTestMember(h.api());
    const leaving = await createTestMember(h.api());
    const book = await h.lentBook("Back On The Shelf", reader);
    await h.placeHold(leaving, book.id);
    await h.giveBack(book.copies[0]?.barcode as string);

    assert.equal((await deleteAccount(leaving)).status, 204);

    assert.equal(await h.availableCopies(reader, book.id), 1);
    await h.assertConsistent(book.id);
  });

  it("writes the deletion to the audit log, with nothing personal, and emails the Member", async () => {
    const member = await createTestMember(h.api());
    const audit = createAuditLog(h.api());
    const before = (await audit.newest())?.seq ?? 0;

    assert.equal((await deleteAccount(member)).status, 204);

    const entries = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "account_deleted");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, member.member.id);
    assert.equal(entries[0]?.subject, member.member.id);
    assert.deepEqual(entries[0]?.data, { accountType: "umak_student", holdsCancelled: 0, clientAddress: "127.0.0.1" });
    assert.equal((await audit.verify()).intact, true);
    const email = h.api().emails.lastTo(member.email);
    assert.equal(email?.subject, "Your LIBRAS account was deleted");
    assert.match(email?.text ?? "", /past Loans and Fines/);
  });

  it("still deletes the account when the email cannot be sent", async () => {
    const member = await createTestMember(h.api());
    h.api().emails.failing = true;
    try {
      assert.equal((await deleteAccount(member)).status, 204);
    } finally {
      h.api().emails.failing = false;
    }
    assert.equal((await signIn(member)).status, 401);
  });

  it("needs a signed-in Member and a password", async () => {
    const member = await createTestMember(h.api());
    assert.equal((await send("POST", "/members/me/delete", { password: member.password })).status, 401);
    assert.deepEqual(await refusal(await send("POST", "/members/me/delete", {}, member.accessToken)), {
      status: 400,
      code: "invalid_request",
      message: "Enter your password to confirm.",
    });
    assert.equal((await me(member.accessToken)).status, 200);
  });
});

describe("Delete my account with a wrong password", () => {
  let api: TestApi;
  const { deleteAccount, signIn, me } = sender(() => api);

  before(async () => {
    api = await startTestApi({ signInLimit: { maxFailures: 2, windowMinutes: 15 } });
  });
  after(() => api.close());

  it("is refused and recorded, counts like a failed sign-in, and the account stays", async () => {
    const member = await createTestMember(api);
    const audit = createAuditLog(api);
    const before = (await audit.newest())?.seq ?? 0;

    assert.deepEqual(await refusal(await deleteAccount(member, "not-my-password")), {
      status: 403,
      code: "password_incorrect",
      message: "That password is incorrect.",
    });
    assert.equal((await deleteAccount(member, "still-not-it")).status, 403);
    const blocked = await deleteAccount(member);
    assert.equal(blocked.status, 429, "blocked after the limit, even with the right password");
    assert.ok(blocked.headers.get("retry-after"));
    assert.equal((await signIn(member)).status, 429, "the same limit as the sign-in screen");

    assert.equal((await me(member.accessToken)).status, 200, "the account is still there");
    const failed = (await audit.entries({ afterSeq: before })).filter((entry) => entry.type === "account_deletion_failed");
    assert.equal(failed.length, 2);
    assert.equal(failed[0]?.subject, member.member.id);
    assert.equal((await audit.entries({ afterSeq: before })).some((entry) => entry.type === "account_deleted"), false);
  });
});

describe("A sign-in deleted outside the app (a test clean-up, the Supabase dashboard)", () => {
  const h = dispatchHarness();

  before(() => h.start());
  after(() => h.stop());

  it("still deletes a Member with no Loans, as the old foreign key did", async () => {
    const member = await createTestMember(h.api());

    await h.api().db.query("delete from auth.users where id = $1", [member.member.id]);

    assert.equal(await leftOf(h.api(), member.member.id), undefined);
  });

  it("is still refused for a Member with Loans, so their circulation records cannot lose their Member", async () => {
    const member = await createTestMember(h.api());
    const book = await h.addBook("Kept By The Library");
    await h.lend(member, book.copies[0]?.barcode as string);

    await assert.rejects(h.api().db.query("delete from auth.users where id = $1", [member.member.id]), { code: "23503" });
    assert.equal((await leftOf(h.api(), member.member.id))?.sign_ins, 1);
  });

  it("refuses a Member record that is not deleted and has no sign-in", async () => {
    await assert.rejects(
      h.api().db.query(
        `insert into public.members (user_id, account_type, first_name, last_name, username, terms_accepted_at)
         values (gen_random_uuid(), 'visitor', 'No', 'Sign-in', 'no_sign_in_' || floor(random() * 1e9)::text, now())`,
      ),
      { code: "23503" },
    );
  });
});
