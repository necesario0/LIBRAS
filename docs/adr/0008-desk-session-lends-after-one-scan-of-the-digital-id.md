# 0008: Scanning the Digital ID starts a desk session, and each Copy is lent through it

**Status:** Accepted
**Date:** 2026-11-14

The desk page used to send the scanned Digital ID with every Copy, and the API checked it again at each Loan. A Digital ID is accepted for its own 60-second window and the one before (ADR 0004), so a Copy scanned more than 60 to 120 seconds after the Digital ID was refused as `digital_id_expired` and the desk dropped the Member: a Member who went to the shelf for a second Book, or a Librarian who was slow with a damaged label, had to show the code again. Now scanning the Digital ID (`POST /desk/members/identify`) starts a **desk session**: an opaque token bound to that Librarian and that Member, which the desk page keeps in memory and sends with each Copy (`POST /desk/loans { deskSession, copy }`). The Digital ID is checked once, when it is scanned.

- The token is 32 random bytes (base64url); the API stores only its SHA-256 hash, in `public.desk_sessions`, which no client role can read.
- A session ends 10 minutes after it starts or was last used (`DESK_SESSION_MINUTES`); every Copy scanned with it renews it, whether that Loan is confirmed or refused, because the Librarian is still serving the Member. "Done with this Member" ends it at once (`POST /desk/sessions/end`), and so does identifying another Member at the same desk page.
- A token that is unknown, expired, ended or another Librarian's is refused the same way: `409 desk_session_ended`, with a message that asks for the Digital ID to be scanned again. The desk page then forgets the Member.
- The Digital ID code is claimed for the Librarian when it is scanned (`digital_id_uses`), not when a Loan is confirmed: the same code at another Librarian's desk is refused with `409 digital_id_used` before any Member details are shown. The same Librarian may scan it again (a new session).
- Every Loan rule is still checked at each Copy, in the Loan's transaction: the Account Type, the loan limit, the Copy's status and the Hold it is set aside for.

## Considered options

- **Accept older Digital ID windows at Loan time**: rejected. It weakens the one property of the Digital ID (a copy of the screen is useless after two minutes) for every check, not just at the desk where the Member stands.
- **A signed token (HMAC) with no table**: rejected. "Done with this Member" must end it at once, which needs state on the server anyway, and renewal would mean handing out a new token on every Loan.
- **Sessions in the API's memory, like scanner pairing (ADR 0005)**: rejected. The table costs one indexed row per visit, survives a deploy or restart in the middle of a visit, and works with more than one API instance. Pairing stays in memory because it is tied to an open stream on one instance.
- **The Librarian's own sign-in session as the binding, with the Member id sent by the desk**: rejected. Any Librarian could then lend to any Member id without the Member present; the desk session proves that this Librarian scanned this Member's current Digital ID within the last 10 minutes of activity.

## Consequences

- The migration `20261114100000_desk_sessions.sql` adds `public.desk_sessions`; the hosted database needs `npm run db:migrate:hosted`.
- A Librarian who walks away from the desk leaves a session that can lend to that Member for up to 10 minutes from the desk page (which is signed in as them anyway). "Done with this Member" closes it.
- Sessions that are over are deleted when the next one starts; there is no separate clean-up job.
- The end-to-end fixture `POST /e2e/loans` and `verify-hosted.ts` go through a desk session too, as the desk page does.
