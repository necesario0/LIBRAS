# @libras/web

The Librarian web pages: the desk page (desktop, at `/`) and the phone scanner page (`/scan.html`, for the phone's browser). Vite, React and TypeScript. The pages talk only to the API, through `src/api.ts`, and take shared types from `@libras/shared`.

## Run

```bash
npm run dev            # from the repo root: starts the database and the API
npm run dev -w @libras/web   # the web pages on http://127.0.0.1:5173
npm run seed           # creates the demo Librarian (see below)
```

Vite forwards `/api/*` to the API (`LIBRAS_API_URL`, default `http://127.0.0.1:3000`), so the browser sees one origin.

Demo Librarian after `npm run seed` (local only): `librarian@libras.test` / `librarian-demo-2026`.

## Browser end-to-end test

```bash
npm run db:start
npm run test:e2e       # from the repo root
```

Playwright starts the real API and Vite on ports 3101 and 5174, seeds a Librarian with the seed script's own code, and drives the machine's installed Chrome at a desktop size. It needs Chrome (GitHub's `ubuntu-latest` has it).

## Layout

- `src/styles/tokens.css`: colors, radii, spacing and type sizes from the mobile Figma designs. Use these, never raw values.
- `src/styles/app.css`: shared styles (brand, buttons, fields) and the page styles.
- `src/api.ts`, `src/session.ts`: API calls, the stored session and its renewal.
- `src/pages/`, `src/components/`: pages and shared pieces.
- `src/scan/scan-input.ts`: the desk page's one scan input point. Every scan source calls `submit(raw, source)`; it runs the shared whitelist (`readScan` in `@libras/shared`) before anything uses the text. `ScanField` is the keyboard source (a USB scanner, or typing then Enter); the paired phone is the second source: `DeskPage` calls `submit(text, "phone")` for each scan the desk stream delivers.
- `src/scanner/`: the phone scanner. `useDeskScanner.ts` (desk side: opens the event stream with the Librarian's session, reconnects and resumes by desk id, exposes the pairing code and state), `ScannerPage.tsx` (phone side: pairing form, camera, feedback for each read, typed fallback, pairing lost), `camera.ts` (`BarcodeDetector` where the browser has Code 128, otherwise ZXing; Code 128, Code 39, EAN-13/8 and UPC-A/E), `scanner-api.ts` (the phone's calls with its scanner token). `scan.html` is that page's entry: Vite builds two pages.

The desk page confirms a Loan in two scans: a Digital ID identifies the Member (`MemberCard`), and a Copy scanned after it (its barcode, or its accession number typed) confirms the Loan through `confirmLoan` in `src/api.ts`. The Loan and its due date show in `LoanNotice`, and the Member's Loans count updates; a refusal shows its reason and keeps the Member, unless their desk session is over (`desk_session_ended`), which asks for a fresh scan of the Digital ID. Scanning the Digital ID starts a desk session (ADR 0008): the desk keeps its token only in memory and sends it with each Copy, so several Copies can go out in one visit however long ago the Digital ID was shown; the session ends 10 minutes after its last use. "Done with this Member", or identifying another Member, ends it at once (`endDeskSession` in `src/api.ts`). Scans are handled one at a time in the order they arrive, so a Copy scanned before the answer about the Digital ID is back still confirms the Loan. A Copy scanned with no Member at the desk records its return through `recordReturn` in `src/api.ts`, and `ReturnNotice` shows the Book, the Copy, who had it and the return date (a Copy back after its due day says so). When the returned Copy is now set aside for a Hold (`loan.heldFor`), a second panel under it says "Set aside for <Member>", to put the Copy on the hold shelf and when the Pickup Window ends, and the status chip reads "Return recorded - set aside for a Hold". A set-aside Copy scanned for any other Member is refused with the reason. The Member stays at the desk until the Librarian chooses "Done with this Member", so after a Loan the desk must be cleared before the next Copy counts as a return; a refused return (not on Loan, unknown Copy) shows its reason and changes nothing.

`e2e/desk-confirm-loan.spec.ts` confirms Loans by barcode and by typed accession number, and shows each refusal (unknown Copy, unreadable scan, Copy already on Loan, loan limit, Visitor). Its desk session tests lend a Copy scanned 125 seconds after the Digital ID (real time: the code has expired by then), show a timed-out session asking for the Digital ID again, and check that Done ends the session.

`e2e/desk-return-copy.spec.ts` records returns by barcode and by typed accession number (after lending through the desk and choosing Done), and shows the refusals (not on Loan, returned twice, unknown or unreadable Copy), a late return, and a return with a waiting Hold: the desk says whom the Copy is set aside for, refuses it to another Member and lends it to the Member of the Hold. `e2e/desk-fixtures.ts` holds what the desk specs share: Members, Books and Copies, and their clean-up.

`e2e/desk-phone-scanner.spec.ts` pairs a phone (a second browser context at a Pixel 7 size on `/scan.html`) with the desk page by the code the desk shows, then injects scans standing in for the camera (typed in the scanner page's fallback field: the same send path as a camera read) and checks they reach the desk page as a Loan, that typed desk input still works beside them, and the wrong-code, whitelist, unpair and desk-closed messages. One test is a real camera read: a second Chrome whose fake camera plays a video of a Code 128 barcode, decoded by ZXing (the engine every browser without `BarcodeDetector` uses). It cannot test a real lens, screen glare or autofocus: the manual checks are in the ticket's closing comment.

`e2e/desk-identify-member.spec.ts` identifies a Member by a Digital ID typed and ended with Enter, shows an expired code being refused (made with the API's own derivation and a clock set three minutes back), and checks that input outside the whitelist never reaches the API.
