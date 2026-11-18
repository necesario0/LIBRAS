# Verification on the hosted system

Two parts. **Tier 2** (issue #40) is the rollout and verification checklist for Renewals, Forgot and Change password, Loan notices, Fines, Clearance and Good standing. The developer works through it in order. **Tier 1** (issue #20) holds the measurements taken on 2026-11-13.

# Tier 2: rollout and verification checklist

Work in Git Bash from an up-to-date checkout of `main`, with `.env.hosted` in the repository root. Never paste a key into a chat or an issue. Each step says how to tell it worked. Write the results in the run record at the end of this part.

Already confirmed on 2026-11-18: Brevo's free plan sends 300 emails a day, Supabase "Secure password change" is off, `SWEEP_SECRET` is set on Render, and the `libras-pickup-expiry` schedule is installed and running.

## 1. Before you start

1. `.env.hosted` has a `SWEEP_SECRET=` line with the value set on Render. `npm run schedule:hosted` saved it there; if you ran that from another folder, copy the line. It worked if `npm run schedule:hosted` says the API accepts the secret.
2. Brevo > Transactional > Statistics (or Logs): note how many emails went out today. Section 6 says how many this checklist adds.
3. Loan notices go out only from 08:00 Manila time. Do sections 4 and 5 after 08:00, or the notice emails come the next morning.

## 2. Migrations (once, before the merge)

1. `npm run db:migrate:hosted -- --dry-run`. It worked if it lists these and no error: `20261117100000_renewals`, `20261117120000_password_resets`, `20261117140000_password_change_audit`, `20261117160000_loan_notices`, `20261117180000_fines`, `20261117200000_fine_settlement`, `20261118100000_loans_private_librarian`, `20261118120000_loan_backdated_audit`, `20261118140000_password_reset_attempts`, `20261118160000_loan_notice_outcome` (plus `20261114100000_desk_sessions` if it was never applied).
2. `npm run db:migrate:hosted`, then type `apply`. It worked if it ends without an error and a second `--dry-run` lists nothing pending.

The migrations add tables, columns, grants and audit event types, and take back the Members' read of `loans.confirmed_by` (the Librarian who confirmed a Loan), which no API query reads as a Member. So the running Tier 1 API keeps working on the new schema. Loans that are out and overdue at this moment start showing a Fine counted from their due date (ADR 0010). Loans returned earlier get none.

## 3. Deploy: the API, then the desk page, then the APK

Both Render services deploy on every commit to `main`, at the same time. A new desk page against the old API crashes the Member panel, and so does the old desk page against the new API. Control the order:

1. Render > `libras-desk` > Settings > Build & Deploy > Auto-Deploy: **Off**.
2. Merge PR #41 into `main`.
3. Render > `libras-api` > Events: the deploy of the merge commit says **Live**. If nothing starts within a minute, use Manual Deploy > Deploy latest commit (README, "Auto-deploy").
4. `npm run check:hosted`, then `curl -s -o /dev/null -w "%{http_code}\n" https://libras-api-g8sj.onrender.com/members/me/clearance`. It worked if it prints `401`. The old API answers `404`.
5. Render > `libras-desk` > Manual Deploy > Deploy latest commit. Wait for **Live**, then set Auto-Deploy back to **On Commit**.
6. Desk computer: reload the desk page, sign in, scan any Member's Digital ID. It worked if the Member panel shows a **Clearance** line ("Cleared" or "Not cleared").
7. `npm run build:apk:hosted -w @libras/mobile` (about 25 minutes; it checks `/health` first). Install `apps/mobile/build/libras.apk` on every Member phone (`adb install -r apps/mobile/build/libras.apk`). It worked if Profile (tap the avatar on Home) shows a **Clearance** card.
8. Tell the Librarians: from now on a Member with an overdue Loan or an unsettled Fine is refused Loans, Holds and Renewals until the Loan is returned and the Fine settled. Fines are settled in the Member panel: scan the Digital ID, then Paid or Waived.

## 4. Automatic check: `npm run verify:hosted -- tier2`

One command walks every Tier 2 path through the hosted API (`checkTier2` in `apps/api/scripts/hosted-checks.ts`). It signs up one test UMAK Student through the real sign-up code (no verification email is sent). It adds the test Book "ZZ Hosted Check Book (delete me) tier 2" with four Copies whose barcodes start `99` (real ones start `31`). Then it checks, in order:

1. Three Copies are lent at the desk.
2. My Loans gives each Loan `renewal`, `renewalCount` and `fine`.
3. A Renewal moves the due date by one loan period, and the one after the renewal limit is refused.
4. A Loan moved three days past its due date shows a Fine so far of three days at the daily rate.
5. Clearance and Good standing name the overdue Loan.
6. A Hold, a Renewal and a Loan are each refused with `overdue_loan`.
7. The sweep endpoint answers `{ expired, noticeEmails }`.
8. The late return fixes the Fine (PHP 15 for a UMAK Student).
9. Clearance and Good standing name the unsettled Fine.
10. A Loan is refused with `unsettled_fine`. The Fine is settled as paid in the same desk session, and the same Copy is then lent.
11. The Member is cleared and in Good standing again, and My Loans shows the Fine as paid.
12. A password reset request for an address with no account gets the same reply a Member gets.
13. The audit log has the Renewal, the Fine and the settlement, and the whole chain is intact.

Then it deletes the test Member, the test Book, its Copies, Loans and Fine, and the reset request. The audit entries stay, as they must. If a step fails, it prints the step and why, and still cleans up. `npm run verify:hosted -- cleanup` removes anything an interrupted run left behind.

Run it now. It worked if it prints 13 `ok` lines and "All 13 Tier 2 checks passed". It is safe to run on production data, before and after the demo.

The test Member's address is changed to a +alias of `SEED_LIBRARIAN_EMAIL` (`<you>+libras-hosted-check-tier2@...`), so the overdue notice the sweep sends it lands in your inbox as "You have an overdue LIBRAS Loan". That is the first real Loan notice through Brevo (section 5, email 1). The sweep it calls is the same one the schedule calls every 5 minutes, so it sends nothing that was not due anyway.

## 5. Real phones and real emails

Walk Parts 8 to 11 of `docs/demo-script.md` on real phones: renew a Loan, receive a due-tomorrow and an overdue notice, see the Fine so far, return a Copy late, meet the Good standing refusals, settle the Fine at the desk and see Clearance change, then reset a password and change it. Loan dates are moved with `npm run verify:hosted -- backdate <Copy barcode> <days>`, which moves one open Loan back by whole days (both when it was lent and when it is due), so nobody waits a week. It moves only a Loan of a test Member (an address that starts with `libras-hosted-check-`, or a +alias with it), refuses any other Loan without changing it, and records each move in the audit log as `loan_backdated`. So Member A for these Parts signs up with a +alias such as `<you>+libras-hosted-check-demo@umak.edu.ph`, after `verify:hosted -- tier2` has run (it deletes every test Member first).

Read each email in the Member's inbox, and look in spam too (see Known limits in Tier 1). Tick each row:

| # | Subject | Sent when | The text says |
| --- | --- | --- | --- |
| 1 | You have an overdue LIBRAS Loan | Section 4, to your +alias | The test Book, "3 days ago", "The Fine so far is PHP 15.", "Please return it to the library desk." |
| 2 | You have an overdue LIBRAS Loan (one email for both Loans) | Demo Part 9, within 5 minutes of the backdate | The overdue Loan with its Fine so far, and the Loan due tomorrow with "If it is returned late, the Fine is PHP 5 a day, up to PHP 300." and why it cannot be renewed |
| 3 | Your LIBRAS password reset code | Demo Part 11, Forgot password | A 6-digit code, which works once |
| 4 | Your LIBRAS password was changed | Right after the reset | The password was reset and every device is signed out |
| 5 | Your LIBRAS password was changed | After Change password in the app | It was changed in the app and other devices are signed out. No password appears |

A Member gets at most one Loan notice email a day. If email 2 does not come, check in Brevo > Logs that the Member did not already get one today, and that it is after 08:00 Manila.

## 6. Brevo budget

Brevo's free plan sends **300 emails a day** (confirmed in the Brevo dashboard on 2026-11-18). A Member gets at most one Loan notice email per library day, so the busiest day sends one per Member with a Loan due tomorrow or overdue, plus sign-up codes, reset codes, password-changed and Hold-ready emails.

| Source | This checklist | A pilot day |
| --- | --- | --- |
| Loan notices | 2 (section 4, demo Part 9) | at most one per Member with a Loan due tomorrow or overdue |
| Reset code and "password was changed" | 3 (demo Part 11) | a few |
| Sign-up codes | 0 to 2 (only if new demo Members are made) | a few |
| Hold ready | 0 to 1 | one per return that sets a Copy aside |
| **Total** | **about 5 to 8** | far below 300 while fewer than about 250 Members have a Loan due or overdue on the same day |

Write the number Brevo shows for the demo day in the run record. If Brevo refuses a send because the limit is reached, the notice is not recorded and the next tick tries again: notices come late, never get lost.

## 7. Visual checks the emulator could not do

The test AVD runs Android 8, which draws no `boxShadow` (React Native needs Android 9 or newer). On a real phone with Android 9 or newer, compare with Figma (`docs/design/figma-screen-inventory.md`):

- [ ] Profile: the "My account" row and the Clearance card have a soft shadow (Figma 572:1468, Fines row 921:14028).
- [ ] My Account: the "Change password" row has a tight shadow (Figma 580:1832).
- [ ] Digital ID: the card has its shadow.
- [ ] My Loans, the overdue Loan: the red line "Fine so far: PHP 15 (3 days late)" sits under "Was due ..." and is not cut off.
- [ ] Change password and Forgot password's new password screen: Cancel and Save sit right under the requirements (Figma 926:14514), and the "Password updated" dialog dims the whole screen, the navigation bar included (Figma 928:14929).
- [ ] Nothing else looks misaligned or cut off on the Tier 2 screens: the Renew confirmation, Change password, Forgot password, the Clearance card, and the reasons shown in place of Renew, Borrow and Place a Hold.

## 8. Proof afterwards

1. `npm run audit:verify:hosted -w @libras/api`. It worked if it prints "Audit log intact: N entries checked". Note N and the head.
2. Fill in the run record.

## Tier 2 run record

| Date | Step | Result | Notes |
| --- | --- | --- | --- |
| | Migrations applied | | |
| | API, desk page and APK deployed in that order | | |
| | `verify:hosted -- tier2` | | |
| | Demo Parts 8 to 11 on real phones | | |
| | Emails 1 to 5 read | | |
| | Brevo emails sent that day | | |
| | Visual checks on Android 9 or newer | | |
| | Audit chain intact (entries) | | |

# Tier 1: measurements

Issue #20. Measured on 2026-11-13 against the hosted system (Render free web service `libras-api` in Singapore, Supabase free project in Singapore, the 45,460 Book / 86,679 Copy sample catalog from `npm run seed:hosted`). The client was the developer's computer on its normal connection, which adds the network time shown below. Reproduce with `npm run verify:hosted -- search` and `npm run verify:hosted -- dispatch` (`apps/api/scripts/verify-hosted.ts`); both read `.env.hosted` and print no secret.

Targets (ADR 0001, SRS): search within 1.0 s at 50 concurrent patrons; Hold dispatch within 10 ms.

## Search through the hosted API

Search is `GET /catalog/search`, as a signed-in Member (a measurement Visitor, `npm run verify:hosted -- member`). Times are milliseconds from the client, so each includes about 63 ms of network to Render (the same measurement on a route that does no work, p50 62.7, p95 78.6).

| Load | n | p50 | p95 | p99 | max | Within 1.0 s |
| --- | --- | --- | --- | --- | --- | --- |
| One request at a time (6 kinds of query: exact word, 1 typo, 2 typos, two words, ISBN, no match) | 300 | 98 | 128 | 221 | 543 | 100% |
| 50 users at once, each pausing 2 to 5 seconds between searches (how patrons search, about 11 searches a second) | 500 | 107 | 537 | 859 | 1075 | 99.4% |
| 50 users at once, no pause: always 50 requests in flight (run 1) | 600 | 1497 | 2422 | 2630 | 2836 | 15.7% |
| The same, run 2 | 600 | 1497 | 2204 | 2656 | 2860 | 18.8% |
| The same, run 3 | 600 | 1390 | 1999 | 2104 | 2482 | 22.3% |

The first search after the service woke took 728 ms (the catalog index is built at start).

Result against the one-second target:

- **Met** for 50 concurrent patrons who search the way people do (reading and typing between searches): 99.4% of searches within 1.0 s, p99 859 ms.
- **Not met** when 50 users hold 50 requests in flight with no pause at all: the free service tops out at 33 to 36 searches a second and, with 50 waiting, every search takes about 50 / 35 = 1.4 s (Little's law). That is a throughput ceiling, not a slow search: a single search takes about 100 ms end to end.

Where the ceiling comes from (the same 50 users, no pause, on other routes, measured the same day):

| Route | Throughput | What it adds |
| --- | --- | --- |
| a route that does nothing (404) | 358 req/s | the platform |
| `/health` (one database query) | 249 req/s | a database round trip |
| `/members/me` (Supabase Auth `GET /user` plus the identity-scoped database transaction every Member route runs) | 58 req/s | the guard |
| `/catalog/search` | 26 to 36 req/s | the search and its availability query, about 20 ms of server time on this instance |

A free Render web service has 0.1 CPU. The same code on the developer's laptop with the local database ran 214 searches a second at 50 users (p50 239 ms), so the ceiling is the instance, not the algorithm (the trie search is about 1 ms of CPU on the laptop). The SRS peak of 250 queries a second is far beyond a free instance.

Options, none applied (a choice for the developer):

1. Accept it for the demo: patrons do not search with zero pause, and the demo has a handful of people. State the result as above in the defense.
2. Move `libras-api` to Render's Starter plan (0.5 CPU, paid) for the demo week and run `npm run verify:hosted -- search` again. About five times the CPU should bring the no-pause run under one second; this is an estimate, not a measurement.
3. Reduce the work of every request (not done: caching the Supabase Auth answer for a few seconds would stop a signed-out session working at once, which the guard's comment says is on purpose).

## Hold dispatch on the hosted database

Part 1: the dispatch query itself (`DISPATCH_SQL` in `apps/api/src/holds/dispatch.ts`, the whole queue of ADR 0001) on the hosted PostgreSQL, with a queue of 100, 1,000 and 5,000 waiting Holds on one Book (5,000 is the ADR's maximum per title; roles weighted 0, 12 and 24 hours). Each size is built inside a transaction that is rolled back, so nothing is kept. 100 dispatches per size. "Database execution time" is PostgreSQL's own time from `EXPLAIN ANALYZE`; the round trip adds the distance from the client to the database (about 39 ms).

| Waiting Holds | Plan | Execution p50 | p95 | p99 | max | Round trip p50 |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | `holds_queue_idx` | 0.6 ms | 0.8 | 0.8 | 0.8 | 39.2 ms |
| 1,000 | `holds_queue_idx` | 0.6 ms | 0.8 | 0.9 | 0.9 | 39.1 ms |
| 5,000 | `holds_queue_idx` | 0.6 ms | 0.8 | 1.5 | 1.5 | 39.0 ms |

Result: the dispatch query takes under 2 ms in the database whatever the queue size, inside the 10 ms limit, and uses the index. The extra time seen from outside is the network to the database.

Part 2: the whole path through the hosted API with real test Members (a borrower, a Student, an NTP / Employee and a Faculty Member), three cycles: the borrower takes the only Copy of a Book at the desk, the Student, the NTP / Employee and the Faculty Member place Holds in that order, the Copy is returned and lent on four times in a row.

| Step | n | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Place a Hold | 9 | 118 ms | 189 | 189 |
| Return with Hold dispatch (close the Loan, choose the Hold, audit, Hold-ready email) | 9 | 402 ms | 834 | 834 |
| Return with nothing waiting | 3 | 117 ms | 178 | 178 |
| Lend (confirm a Loan) | 12 | 142 ms | 621 | 621 |

Result: in all three cycles the Copy was set aside for the Faculty Member first, then the NTP / Employee, then the Student (the role-weighted order, though they placed their Holds in the opposite order), each pickup lent the set-aside Copy to the right Member, and the last return made the Copy available. A return that dispatches takes about 285 ms longer than one that does not: more database work in the same transaction (the Hold, the Copy, the audit entry) and the Brevo call for the Hold-ready email, which the API waits for before it answers the desk. Nine Hold-ready emails reached the developer's +alias inbox, which also shows email delivery from the hosted API.

The test Members, Book, Copy, Loans and Holds were deleted afterwards (`npm run verify:hosted -- cleanup` does the same).

## Audit chain

`npm run audit:verify:hosted -w @libras/api` after the runs above: "Audit log intact: 33 entries checked" (12 returns, 12 Loans, 9 Hold dispatches, all from the dispatch run). After the demo walk on real phones (2026-11-13): "Audit log intact: 48 entries checked".

## Demo walk and camera checks on real phones

Run by the developer on 2026-11-13 against the hosted API, the `libras-desk` static site and the hosted APK. The full demo path in `docs/demo-script.md` passed: sign-up, sign-in, search, Borrow, Digital ID scanned by the Librarian's paired phone, Loan confirmed, return, Hold placed, dispatched and picked up. The camera checks passed (Digital ID from a phone screen, a Copy label, the 3 second repeat guard, a scanner session of more than 10 minutes on Render), and no visible difference from Figma was found.

## Known limits

- **Search under no-pause load.** The free Render instance (0.1 CPU) serves about 33 to 36 searches a second, so 50 users searching with no pause miss the one-second target. Patron-paced load meets it. Moving the API to a paid instance and re-running `npm run verify:hosted -- search` is the remedy.
- **Verification email lands in spam at UMAK.** Mail is sent through Brevo with a `@umak.edu.ph` sender, which that domain does not authorise, so UMAK's Google mail files it as spam (Brevo reports it delivered). The remedy is a sender on a domain authenticated in Brevo (DKIM, SPF, DMARC), or UMAK IT authorising Brevo for `umak.edu.ph`. Until then, presenters mark the code email "Not spam" before the demo.
- **Render auto-deploy did not fire** for the merges of PR #22 and #23; the API was deployed by hand. Check it after every merge to `main` (README, "Auto-deploy: check that a merge reaches Render").
