# 0005: The phone scanner sends scans through the API, and the desk page hears them on a server-sent event stream

**Status:** Accepted
**Date:** 2026-11-13

The Librarian's phone is the barcode scanner for the demo (spec #2). The phone opens a scanner page in its browser, pairs with the desk page using a six-digit code, and every barcode its camera reads is delivered to the desk page in about a second. We deliver it through the API: the phone `POST`s each scan with a scanner token, and the desk page keeps one `GET /desk/scanner/events` stream open (server-sent events, read with `fetch` so it can send the Librarian's bearer token). Pairing state lives in the API's memory, which is correct because the API runs as one process on one free Render instance (ADR 0003). The scanner page is not signed in: pairing gives it a random token that the API accepts only on the `/scanner/*` endpoints, and only for sending scans to the one desk page it paired with. Every scan passes the shared scan whitelist in the API and again in the desk page's scan input point.

## Considered options

- **WebSockets (`ws` or Socket.IO)**: rejected. Render supports them, but they need a dependency on the API, a hand-made way to carry the bearer token (a query string leaks into logs, a first message needs a protocol), and the traffic is one-way in each direction: scans go phone to API over a plain `POST`, events go API to desk. SSE is plain HTTP that every proxy, CORS rule and test already handles.
- **Polling the API every second**: rejected. A second of latency at best, and a request per second per desk page against a free instance.
- **Supabase Realtime or a database table the desk page polls**: rejected. The pages talk only to the API, never to the database (spec #2), and a table of scans would put scan text in the audit trail's neighbourhood for no benefit.
- **A peer-to-peer link (WebRTC)**: rejected. Needs signalling through a server anyway, plus STUN and TURN for two devices on different networks.
- **Opening a QR code instead of typing a code**: kept for later. The pairing code is the requirement; a QR code of the scanner address is a convenience that needs a QR generator.

## Consequences

- Latency is one HTTP request plus one write to an open stream: a few tens of milliseconds locally (the browser end-to-end test asserts under 1.5 s including its own overhead), so "about a second" has a wide margin even through Render.
- The API restarting (a deploy, or Render waking from sleep) ends every pairing. The phone is told `pairing_lost` and the Librarian types a new code. A desk page that reconnects within 60 seconds keeps its pairing (the stream is resumed by desk id, for the same Librarian only).
- A stream lives at most 30 minutes, then the API ends it and the page reconnects with a session that is checked again, so a signed-out or expired session cannot hold a pairing for ever. The stream sends a comment every 15 seconds so proxies and the host do not close it as idle.
- Pairing attempts are limited per client address (5 wrong codes in 5 minutes, then 429), the code is six digits valid for two minutes and works once, and a phone may send at most 30 scans in 10 seconds.
- More than one API instance would break this (a scan could reach an instance that does not hold the desk page's stream). The move then is a shared channel such as PostgreSQL `LISTEN/NOTIFY` behind the same hub interface (`apps/api/src/scanner/hub.ts`); the HTTP surface does not change.
- The phone camera needs a secure context (HTTPS). The hosted web pages are served by a Render static site, which is HTTPS (README, "Hosting the desk page and the phone scanner page").
