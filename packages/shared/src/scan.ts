/**
 * What the desk page's scan input point accepts. Every scan source (a USB
 * scanner or a person typing and pressing Enter, the paired phone) hands its raw
 * text to `readScan`, which checks it against a whitelist before anything uses it.
 *
 * Only Digital IDs are recognised so far. The Loan ticket adds Copy barcodes and
 * accession numbers as further `kind`s.
 */

/** Longest input the scan input point looks at. */
export const SCAN_INPUT_MAX_LENGTH = 64;

/** The whitelist: ASCII letters, digits, spaces and hyphens, 1 to 64 of them. */
export const SCAN_INPUT_PATTERN = /^[0-9A-Za-z -]{1,64}$/;

/** A Digital ID as a scanner sends it (12 digits) or as the app prints it (three groups of four). */
const DIGITAL_ID_INPUT_PATTERN = /^[0-9]{4} ?[0-9]{4} ?[0-9]{4}$/;

export const SCAN_MESSAGES = {
  empty: "Nothing was scanned. Scan the barcode again or type the code and press Enter.",
  notAllowed: "That scan has characters a LIBRAS barcode never has. Scan it again or type the code.",
  unrecognised: "That is not a Digital ID. Scan the barcode on the Member's phone, or type the 12-digit code beneath it.",
} as const;

export type ScanRejection = "empty" | "not_allowed" | "unrecognised";

export type ScanReading =
  | { kind: "digital_id"; code: string }
  | { kind: "rejected"; reason: ScanRejection; message: string };

/**
 * Turns raw scan text into something the desk can act on. Surrounding
 * whitespace and line endings are dropped (scanners end with Enter or Tab);
 * anything outside the whitelist is rejected before it is looked at further.
 */
export function readScan(raw: string): ScanReading {
  const text = raw.trim();
  if (text.length === 0) return { kind: "rejected", reason: "empty", message: SCAN_MESSAGES.empty };
  if (text.length > SCAN_INPUT_MAX_LENGTH || !SCAN_INPUT_PATTERN.test(text)) {
    return { kind: "rejected", reason: "not_allowed", message: SCAN_MESSAGES.notAllowed };
  }
  if (DIGITAL_ID_INPUT_PATTERN.test(text)) return { kind: "digital_id", code: text.replaceAll(" ", "") };
  return { kind: "rejected", reason: "unrecognised", message: SCAN_MESSAGES.unrecognised };
}
