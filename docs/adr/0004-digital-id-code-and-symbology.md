# 0004: Digital ID as a 12-digit Code 128 code: fixed number plus TOTP token

**Status:** Accepted
**Date:** 2026-11-12

A Digital ID is 12 digits, drawn as Code 128 subset C with the same digits printed beneath it in groups of four. The first 6 digits are the Member's Digital ID number: random, unique and fixed. The last 6 are a token, HMAC-SHA-256 of the current 60-second window under a 32-byte per-Member secret, truncated as in RFC 4226 (that is TOTP, RFC 6238, with a 60-second step). The API accepts the current window and the one before. We chose Code 128 subset C because it packs two digits per symbol: 12 digits are 101 modules, so on a phone screen each module is 2 to 3 points wide, which phone cameras read off a lit screen and which every common USB scanner reads with factory settings. We put the number in the code so that a scan names exactly one Member: the token is then checked against that one Member's secret and the check fails closed.

## Considered options

- **Token only, matched against every Member's secret**: rejected. A scan would cost one HMAC per Member, and with any token short enough to type, two Members would sometimes share a token in the same window, so the lookup could be ambiguous.
- **EAN-13 or UPC-A**: rejected. Retail symbologies with a fixed length and their own check digit, and many scanners rewrite them by default (a leading zero dropped when EAN-13 becomes UPC-A).
- **Code 39**: rejected. About twice as wide for the same digits, so thinner bars on a phone screen.
- **Interleaved 2 of 5**: rejected. Often switched off or length-limited on USB scanners out of the box.
- **QR code** (as in the Figma frame): rejected. The glossary defines the Digital ID as a 1D barcode like the ones on the books, and 1D-only USB scanners cannot read a QR code.
- **A longer token (8 digits)**: rejected for now. 6 digits give a 2 in a million chance per guess across both accepted windows, guessing needs a signed-in Librarian session, and a 16-digit code is harder to type when a scan fails.

## Consequences

- The secret never leaves the API: no client role has any privilege on `digital_id_secrets`, and the app asks the API for the current code, so the phone cannot show a Digital ID offline.
- The Digital ID number is not secret. A screenshot reveals it, but it is useless without a current token.
- Copy barcodes (10 digits) and Digital IDs (12 digits) are told apart by length at the scan input point.
- Guesses at the desk are not rate limited yet. If that becomes a concern, count refused Digital IDs per Librarian.
