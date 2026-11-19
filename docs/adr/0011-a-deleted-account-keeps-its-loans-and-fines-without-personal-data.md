# 0011: A deleted account keeps its Loans and Fines, on a Member record with no personal data

**Status:** Accepted
**Date:** 2026-11-19

A Member can delete their account from Settings (spec #42, Q24). We had to choose between erasing everything about the Member and keeping the library's circulation records. We keep the records. The Member record stays, with the same id, so the Loans, the Fines and the audit log entries that name that id still point at it. Every personal field of the record is emptied: name, username, contact number and the sign-up details (student number, college and the other Account Type details). The sign-in (the Supabase Auth user, which holds the email and the password) is deleted. What is left is the id, the Account Type, the sign-up and deletion times, and the circulation history.

Only a cleared Member can delete their account: no Loan still out and no unsettled Fine. So a deleted Member never owes the library a Copy or money, and the records that stay are history only.

## Why keep the Loans and Fines

- The library needs them: how often a Book circulates, what was lent to which Account Type, which Fines were paid or waived and by which Librarian. Deleting a Member's Loans would quietly change those numbers and the settled Fines behind them.
- The audit log is append-only and hash-chained (it cannot drop entries), and its entries name Loans and Members by id. A Loan deleted from under its entries would leave them pointing at nothing.
- Without the name, email and sign-up details, a kept Loan says "a UMAK Student borrowed this Copy from this date to that date". It no longer says who.

## Considered options

- **Delete the Member and everything that names them.** Rejected for the reasons above. `loans.member_id` was already `on delete restrict` to stop exactly this.
- **Move the Loans and Fines to one shared "deleted Member" record.** Rejected: every Fine is tied to its Loan and its Member together (`fines_loan_fk`), the audit log keeps the old id anyway, and one shared record would merge the histories of different people into one.
- **Keep the Supabase Auth user and only block it (Supabase's soft delete).** Rejected: the email would stay in Supabase Auth's own tables, and "the sign-in is deleted" is easier to check than a flag kept outside our schema.
- **Delete the Supabase Auth user through its admin API after our own transaction.** Rejected: a failure between the two steps would leave either a Member who can still sign in without personal data, or one who cannot sign in but still has it. The API deletes `auth.users` in SQL, inside the same transaction as everything else (Supabase Auth's sessions and refresh tokens go with it through their own foreign keys), so the deletion happens whole or not at all.

## Consequences

- `members.user_id` no longer references `auth.users`. Two triggers keep the old rule for a Member who is not deleted: such a record needs a sign-in, and deleting a sign-in anywhere else (a test clean-up, the Supabase dashboard) still deletes the record, and is still refused while the Member has Loans. Only the API's deletion sets `deleted_at`, and only a record with `deleted_at` may lack the personal fields (a check constraint).
- The email, username and student number are free again, so the person can sign up later as a new Member, with no link to the old record.
- Kept: Holds that ended (their states are their history), Loan notice records, and the audit log, including old `sign_in_failed` entries that hold the email typed at a refused sign-in. The audit log cannot be edited (by design), so those emails stay. Deleted with the account: Saved books, the Digital ID secret, desk sessions, Forgot password codes and counts, and waiting or ready Holds, which are cancelled first (a ready Hold's Copy goes to the next waiting Hold, as with any cancel, ADR 0006).
- Undoing a deletion is not possible: the personal data is gone. A reporting query must not assume every Member has a name.
