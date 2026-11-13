# LIBRAS Tier 1 demo script

The demo path of spec #2, run on the hosted system with real phones. About 15 minutes. The same script is the acceptance run for issue #20: tick each check as it is done, and note the date and the people present at the end.

Words follow the glossary: Member, Account Type, Librarian, Book, Copy, Loan, Hold, Pickup Window, Digital ID.

## What you need

| Item | Detail |
| --- | --- |
| Hosted API | `https://libras-api-....onrender.com` (the address in `EXPO_PUBLIC_API_URL` of `.env.hosted`), woken and healthy |
| Desk computer | Chrome, signed in to the desk page (the hosted static site over HTTPS) as the Librarian |
| Librarian's phone (Chrome on Android) | Opens `<desk site>/scan.html`; the camera is allowed |
| Member phone A | The hosted APK installed. A UMAK Student (or Faculty) Member |
| Member phone B | The hosted APK installed (or the same phone after signing out). A second borrowing Member, for the Hold. Faculty or NTP / Employee shows the role-weighted order best |
| Mailboxes | Two `@umak.edu.ph` inboxes the presenter can open (the borrowing Account Types need one), plus any inbox for a Visitor |
| Printed Copy labels | At least two Copies of one Book, as Code 128 labels of the Copy's 10-digit barcode (`31` then 8 digits). `npm run labels:hosted -- --title "introduction to algorithms" --copies 3` writes `copy-labels.html`: open it in Chrome and print at 100% scale on white matte paper |

Pick one Book before the demo and note its title (the labels command prints the title and the barcodes it used), so that the demo does not depend on searching blind.

## Before the audience arrives (10 minutes ahead)

1. `npm run check:hosted` from the repository root. It waits for Render to wake and prints that the API is healthy. Run it again two minutes before starting.
2. Desk computer: open the desk site, sign in as the Librarian. The page shows a "Phone scanner" panel with a pairing code, the countdown and the scanner address.
3. Librarian's phone: open the scanner address (it starts with `https://`), type the code. Desk shows "Phone paired", phone shows "Connected to desk". Point the phone at a Copy label once: the desk shows the scan.
4. Both Member phones: the app is open and signed out, on the welcome screen.
5. One Book with exactly one available Copy is chosen for the Loan, and a second Member is ready to place a Hold on it.

Checks:

- [ ] API healthy and awake
- [ ] Desk page signed in, phone paired, one test scan arrived

## Part 1: sign up and sign in (user stories 1 to 17)

1. Phone A, welcome screen: choose sign up. Choose **UMAK Student** (point out that Faculty, NTP / Employee, Visitor and Alumni are the other four).
2. Type a non-UMAK email (for example a Gmail address): the app refuses it and says a `@umak.edu.ph` address is needed.
3. Fix it with the real UMAK address. Fill in the student details, accept the terms, continue.
4. The app asks for the verification code. Open the UMAK inbox, read the six digit code from the "LIBRAS" email, enter a wrong one first (clear error), then the right one.
5. The account is active at once. Sign out, sign in with the email and password. Give a wrong password once: the message does not say which of the two was wrong.
6. Close and reopen the app: still signed in.

Repeat sign-up on phone B with a second borrowing Account Type (Faculty or NTP / Employee), so that two Members exist. Optional: show a Visitor sign-up with a personal email, which can search but cannot borrow.

Checks:

- [ ] Sign-up with verification email delivered by Brevo
- [ ] Wrong email domain, wrong code and wrong password each give a clear message
- [ ] Still signed in after the app is reopened

## Part 2: search and the Book page (user stories 18 to 29)

1. Phone A, Home: the greeting, the search bar, the Loans and Holds summary cards, and the Digital ID entry.
2. Search for the chosen Book by its title with a deliberate typo (for example drop one letter): the Book still appears, with its available Copy count. It answers within a second.
3. Search by the Book's ISBN or by a Copy's accession number: an exact match.
4. Search for nonsense: the neutral "No Books found" state, not an error.
5. Open the Book: details, Copies, available count.

Checks:

- [ ] Typo search finds the Book and shows the available count
- [ ] Exact search by ISBN or accession number works
- [ ] Empty result is distinct from a failure

## Part 3: Borrow, Digital ID, Loan confirmed (user stories 30 to 40, 51 to 59)

1. Phone A, Book page: tap **Borrow**. The Digital ID opens: a 1D barcode with 12 digits beneath it, and "Show it to the librarian at the desk". Wait for it to change (every 60 seconds).
2. Raise the brightness. At the Librarian's phone, hold it 15 to 25 cm from the Digital ID so that the whole barcode is inside the frame. The phone says "Sent <12 digits> to the desk" and vibrates.
3. Desk: the Member card appears with name, Account Type and "Loans x of 3".
4. Librarian's phone: scan the printed label of the available Copy. Desk: the Loan is confirmed with its due date.
5. Phone A: the Digital ID screen gives way to **Successfully Borrowed** with the Book and the due date. Open **View My Books**: the Loan is listed under Current.
6. On the desk press **Done with this Member**.
7. Show the refusals the desk gives: scan the same Copy again for a Member (Copy already on Loan), or an expired Digital ID.

Checks:

- [ ] Digital ID read from a phone screen by the Librarian's phone camera
- [ ] Printed Copy barcode read by the Librarian's phone camera
- [ ] Loan appears on the desk page and in the Member's app within a few seconds

## Part 4: a Hold on a Book with no available Copy (user stories 41 to 50)

1. Phone B, the same Book: no Copy is available, so the Book page shows **Place a Hold** instead of Borrow. Tap it. The panel says the Hold is waiting.
2. Try to place it again from My Holds: only one Hold per Book is allowed.
3. Phone B, Home: the Holds card says "1 waiting".

## Part 5: return and dispatch (user stories 49, 50, 60, 61)

1. Desk, with no Member at the desk: scan the Copy that Member A borrowed. The desk shows the return, and a second panel says "Set aside for <Member B>", with the time the Pickup Window ends. Put the Copy on the hold shelf.
2. Phone A: My Loans shows the Loan under Past Loans.
3. Phone B: My Holds shows **A Copy is set aside for you** with the end of the Pickup Window. The "Your LIBRAS Hold is ready for pickup" email arrives in B's inbox.
4. Try to lend the same Copy to Member A at the desk: refused, set aside for another Member.

Checks:

- [ ] Desk says which Member the returned Copy is set aside for
- [ ] The Hold is Ready in the app and the Hold-ready email arrives

## Part 6: pickup (user stories 50 and 35)

1. Phone B: tap **Show my Digital ID** on the Book page. The Librarian's phone scans it, then scans the set-aside Copy.
2. Desk: Loan confirmed for Member B. Phone B: Successfully Borrowed. My Holds lists the Hold under Past as Borrowed.

Checks:

- [ ] The set-aside Copy is lent only to the Member of the Hold

## Part 7 (optional): the Pickup Window ends (user story 49)

The window is 24 hours (`library_settings.pickup_window_hours`), so this is shown on stage only if it was set to 1 hour beforehand (the setting is whole hours and affects only later dispatches), and is otherwise shown from the audit log instead. With a ready Hold that nobody collects, within five minutes after the window ends the database schedule wakes the API, the Hold becomes Expired and the Copy passes to the next waiting Hold or becomes available. Set the value back to 24 afterwards.

## Part 8: proof afterwards

1. `npm run audit:verify:hosted -w @libras/api`: prints that the audit chain is intact. It covers the sign-in failures, Loans, the return, the Hold dispatch and the pickup of the run.
2. The recorded measurements (search under 50 concurrent users, Hold dispatch on the hosted database) are in `docs/hosted-verification.md`; quote them if asked.

Checks:

- [ ] Audit chain verifies as intact after the whole run

## Fallbacks during the demo

| Problem | What to do |
| --- | --- |
| The app shows a failure on the first request | Render was asleep. Run `npm run check:hosted`, then Try again |
| The scanner page says the pairing was lost | The API restarted or slept. Type the desk's new code on the phone |
| A barcode will not read | Type the number in the "Barcode damaged?" field on the phone, or into the desk page's field |
| No email arrives | Look in the spam folder first. Brevo's log (Transactional, Logs) shows whether it was sent |
| Camera blocked | Site settings for the scanner address, allow the camera, reload |

## Run record

| Date | Hosted API address | Phones | Who ran it | Result |
| --- | --- | --- | --- | --- |
| 2026-11-13 | https://libras-api-g8sj.onrender.com | Android phones (Member and Librarian) | Developer | Passed, audit log intact (48 entries) |
