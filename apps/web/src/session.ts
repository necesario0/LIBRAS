import type { Session } from "@libras/shared";

// The session lives in sessionStorage: it survives a page reload at the desk
// and is gone when the tab closes, which suits a shared library computer.
const KEY = "libras.session";

export function loadSession(): Session | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage is blocked: the person stays signed in until the next reload.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
