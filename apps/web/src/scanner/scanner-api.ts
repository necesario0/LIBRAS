import type { PairScannerResponse, ScannerStatusResponse } from "@libras/shared";
import { failure, send } from "../api.ts";

/**
 * The scanner page's calls. It is not signed in: its only credential is the
 * scanner token it got by pairing, and the API accepts that token on these
 * endpoints and nowhere else.
 */

/** Pairs with the desk page that shows `code`. Throws ApiError: `pairing_code_invalid`, `too_many_attempts`, `invalid_request` or `unreachable`. */
export async function pair(code: string): Promise<string> {
  const response = await send("/scanner/pair", { method: "POST", body: JSON.stringify({ code }) });
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as PairScannerResponse).token;
}

/** Sends one scan the camera read (or the Librarian typed) to the desk page. Throws ApiError: `pairing_lost`, `desk_offline`, `scan_rejected`, `too_many_scans` or `unreachable`. */
export async function sendScan(token: string, text: string): Promise<void> {
  const response = await send("/scanner/scans", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await failure(response);
}

/** Whether the pairing still stands, and whether the desk page is listening. Throws ApiError `pairing_lost` or `unreachable`. */
export async function pairingStatus(token: string): Promise<ScannerStatusResponse> {
  const response = await send("/scanner/status", { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as ScannerStatusResponse;
}

/** Ends the pairing from the phone's side. Never throws: the phone forgets the token either way. */
export async function leavePairing(token: string): Promise<void> {
  try {
    await send("/scanner/pairing", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  } catch {
    // The pairing ends by itself when the desk page goes away.
  }
}

// The token lives in sessionStorage: it survives a reload of the scanner page and is gone when the tab closes.
const KEY = "libras.scanner-token";

export function loadToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Storage is blocked: the pairing lasts until the page reloads.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
