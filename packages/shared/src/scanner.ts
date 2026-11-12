import { z } from "zod";

/**
 * The phone as the scanner (spec #2, ticket #16). The desk page asks the API for
 * a short pairing code and shows it. The Librarian types it on the scanner page
 * in the phone's browser, which gets a scanner token that can do one thing: send
 * scans to that desk page. The desk page hears them on a server-sent event
 * stream and feeds them to its scan input point like typed input.
 */

/** Digits in a pairing code. */
export const PAIRING_CODE_LENGTH = 6;

/** How long a pairing code can be used, seconds. The desk page shows a new one when it runs out. */
export const PAIRING_CODE_SECONDS = 120;

/** A pairing code as typed: six digits, with spaces allowed ("482 913"), reduced to the six digits. */
export const pairingCodeSchema = z
  .string()
  .max(32)
  .transform((text) => text.replace(/\s/g, ""))
  .pipe(z.string().regex(/^[0-9]{6}$/));

/** The body of `POST /scanner/pair`. */
export const pairScannerRequestSchema = z.object({ code: pairingCodeSchema }).strict();

/**
 * The body of `POST /scanner/scans`: the text the camera read. It is checked
 * against the scan whitelist (`readScan`) by the API before the desk page sees
 * it, and again by the desk page's scan input point.
 */
export const sendScanRequestSchema = z.object({ text: z.string().min(1).max(200) }).strict();

/** What `POST /scanner/pair` answers. The token is the scanner page's only credential. */
export interface PairScannerResponse {
  token: string;
}

/** What `GET /scanner/status` answers: the pairing still stands, and whether the desk page is listening right now. */
export interface ScannerStatusResponse {
  deskOnline: boolean;
}

/** The payload of each event on the desk page's stream (`GET /desk/scanner/events`), by event name. */
export interface DeskScannerEvents {
  /** First event: the id to send as `?desk=` when the stream reconnects, so the pairing survives. */
  desk: { deskId: string };
  /** The code to show, and when it stops working. Sent again whenever the code changes. */
  pairing: { code: string; expiresAt: string };
  /** A phone paired with this desk page. */
  paired: Record<string, never>;
  /** The phone left, or the Librarian unpaired it. A `pairing` event follows. */
  unpaired: Record<string, never>;
  /** One scan from the paired phone: text that has already passed the whitelist. */
  scan: { text: string };
  /** The stream is ending on purpose (its time is up): reconnect with the same desk id. */
  end: Record<string, never>;
}

export type DeskScannerEventName = keyof DeskScannerEvents;

export const SCANNER_MESSAGES = {
  pairingCodeInvalid:
    "That pairing code is wrong or has expired. Check the code on the desk page - it changes every two minutes - and try again.",
  pairingCodeFormat: "A pairing code is 6 digits. Type the code shown on the desk page.",
  pairingLost: "This phone is no longer paired with the desk page. Enter the pairing code again.",
  deskOffline: "The desk page is not connected right now. Check it is open and signed in, then scan again.",
  tooManyScans: "Scanning too fast. Wait a moment and scan again.",
  scanFormat: "Nothing was sent. Scan the barcode again.",
} as const;
