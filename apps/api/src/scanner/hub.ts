import { createHash, randomBytes, randomInt } from "node:crypto";
import { PAIRING_CODE_LENGTH, PAIRING_CODE_SECONDS, SCANNER_MESSAGES } from "@libras/shared";
import type { DeskScannerEventName, DeskScannerEvents } from "@libras/shared";
import type { Clock } from "../clock.ts";
import { AppError } from "../errors.ts";

export interface ScannerOptions {
  /** How long a pairing code works. Default: PAIRING_CODE_SECONDS (120). */
  codeSeconds?: number;
  /** How long a desk page may be disconnected before its pairing is dropped for good. Default 60. */
  deskGraceSeconds?: number;
  /** How long one desk stream stays open before the API ends it and the page reconnects with a fresh token. Default 1800. */
  streamSeconds?: number;
  /** The most scans one phone may send in `scanWindowSeconds`. Default 30 in 10 seconds. */
  maxScans?: number;
  scanWindowSeconds?: number;
}

/** The desk page's end of a stream: what the hub writes events to. */
export interface DeskSink {
  send<Name extends DeskScannerEventName>(name: Name, payload: DeskScannerEvents[Name]): void;
  /** Ends the stream. */
  close(): void;
}

interface Desk {
  id: string;
  librarianId: string;
  /** The page's open stream, or undefined while it is away. */
  sink: DeskSink | undefined;
  /** When the stream went away, by the API's clock (ms). */
  offlineSince: number | undefined;
  code: { value: string; expiresAt: number; timer: NodeJS.Timeout } | undefined;
  phone: { tokenHash: string; scanTimes: number[] } | undefined;
}

const DEFAULTS = { codeSeconds: PAIRING_CODE_SECONDS, deskGraceSeconds: 60, streamSeconds: 1800, maxScans: 30, scanWindowSeconds: 10 };

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function pairingLost(): AppError {
  return new AppError(401, "pairing_lost", SCANNER_MESSAGES.pairingLost);
}

/**
 * Where desk pages and the phones paired with them meet (ticket #16). The API
 * runs as one process (the one free Render instance), so this lives in memory
 * like the sign-in limiter: a restart ends every pairing, the phone is told
 * `pairing_lost`, and the Librarian pairs again. Nothing here is stored in the
 * database and nothing in it can reach the database.
 *
 * A desk page opens a stream as a signed-in Librarian and gets a six-digit
 * pairing code. A phone that presents the code gets a random scanner token,
 * which is its only credential and can only send scans to that desk page.
 * Everything is checked against the injected clock, so tests prove expiry
 * without waiting.
 */
export class ScannerHub {
  readonly #clock: Clock;
  readonly #options: Required<ScannerOptions>;
  readonly #desks = new Map<string, Desk>();
  readonly #deskByCode = new Map<string, Desk>();
  readonly #deskByToken = new Map<string, Desk>();

  constructor(clock: Clock, options: ScannerOptions = {}) {
    this.#clock = clock;
    this.#options = { ...DEFAULTS, ...options };
    // Drops the desk pages that stayed away too long, so memory does not fill with abandoned pairings.
    setInterval(() => this.#sweep(), 15_000).unref();
  }

  get streamSeconds(): number {
    return this.#options.streamSeconds;
  }

  /**
   * A desk page of this Librarian connects. `resumeId` (the id of its earlier
   * stream) takes the earlier pairing back, but only for the same Librarian and
   * only while the page was away for less than the grace time; anything else
   * gets a new desk. Returns the function to call when the stream closes.
   */
  connectDesk(librarianId: string, sink: DeskSink, resumeId?: string): () => void {
    this.#sweep();
    const known = resumeId === undefined ? undefined : this.#desks.get(resumeId);
    const desk = known && known.librarianId === librarianId ? known : this.#newDesk(librarianId);
    // A second stream of the same page (a quick reload): the older one is over.
    const older = desk.sink;
    desk.sink = sink;
    desk.offlineSince = undefined;
    older?.close();

    sink.send("desk", { deskId: desk.id });
    if (desk.phone) sink.send("paired", {});
    else this.#showCode(desk);

    return () => {
      if (desk.sink !== sink) return;
      desk.sink = undefined;
      desk.offlineSince = this.#clock.now().getTime();
    };
  }

  /** A phone gives a pairing code. Throws 403 `pairing_code_invalid` for a wrong, used or expired code. */
  pair(code: string): string {
    this.#sweep();
    const desk = this.#deskByCode.get(code);
    const now = this.#clock.now().getTime();
    if (!desk?.sink || !desk.code || desk.code.expiresAt <= now) {
      throw new AppError(403, "pairing_code_invalid", SCANNER_MESSAGES.pairingCodeInvalid);
    }
    this.#clearCode(desk);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashOf(token);
    desk.phone = { tokenHash, scanTimes: [] };
    this.#deskByToken.set(tokenHash, desk);
    desk.sink.send("paired", {});
    return token;
  }

  /** One scan from a paired phone, already checked against the whitelist, goes to its desk page. */
  deliver(token: string, text: string): void {
    const desk = this.#deskOf(token);
    const phone = desk.phone as NonNullable<Desk["phone"]>;
    if (!desk.sink) throw new AppError(409, "desk_offline", SCANNER_MESSAGES.deskOffline);

    const now = this.#clock.now().getTime();
    const recent = phone.scanTimes.filter((time) => time > now - this.#options.scanWindowSeconds * 1000);
    if (recent.length >= this.#options.maxScans) {
      phone.scanTimes = recent;
      throw new AppError(429, "too_many_scans", SCANNER_MESSAGES.tooManyScans);
    }
    phone.scanTimes = [...recent, now];
    desk.sink.send("scan", { text });
  }

  /** Whether the pairing of this token still stands and its desk page is listening. Throws `pairing_lost` otherwise. */
  status(token: string): { deskOnline: boolean } {
    return { deskOnline: this.#deskOf(token).sink !== undefined };
  }

  /** The phone leaves. */
  leave(token: string): void {
    this.#unpair(this.#deskOf(token));
  }

  /** The Librarian unpairs the phone from the desk page. Does nothing for a desk page that is not theirs. */
  unpairDesk(librarianId: string, deskId: string): void {
    const desk = this.#desks.get(deskId);
    if (desk && desk.librarianId === librarianId && desk.phone) this.#unpair(desk);
  }

  #deskOf(token: string): Desk {
    this.#sweep();
    const desk = this.#deskByToken.get(hashOf(token));
    if (!desk?.phone) throw pairingLost();
    return desk;
  }

  #newDesk(librarianId: string): Desk {
    const desk: Desk = { id: randomBytes(16).toString("base64url"), librarianId, sink: undefined, offlineSince: undefined, code: undefined, phone: undefined };
    this.#desks.set(desk.id, desk);
    return desk;
  }

  /** Gives the desk page a fresh code and tells it. */
  #showCode(desk: Desk): void {
    this.#clearCode(desk);
    let value: string;
    do {
      value = String(randomInt(0, 10 ** PAIRING_CODE_LENGTH)).padStart(PAIRING_CODE_LENGTH, "0");
    } while (this.#deskByCode.has(value));
    const lifetimeMs = this.#options.codeSeconds * 1000;
    const expiresAt = this.#clock.now().getTime() + lifetimeMs;
    // The timer only keeps the page's code fresh; refusing an expired code never depends on it.
    const timer = setTimeout(() => {
      if (desk.code?.value === value && desk.sink && !desk.phone) this.#showCode(desk);
    }, lifetimeMs);
    timer.unref();
    desk.code = { value, expiresAt, timer };
    this.#deskByCode.set(value, desk);
    desk.sink?.send("pairing", { code: value, expiresAt: new Date(expiresAt).toISOString() });
  }

  #clearCode(desk: Desk): void {
    if (!desk.code) return;
    clearTimeout(desk.code.timer);
    this.#deskByCode.delete(desk.code.value);
    desk.code = undefined;
  }

  #unpair(desk: Desk): void {
    if (!desk.phone) return;
    this.#deskByToken.delete(desk.phone.tokenHash);
    desk.phone = undefined;
    desk.sink?.send("unpaired", {});
    if (desk.sink) this.#showCode(desk);
  }

  /** Forgets every desk page that has been away longer than the grace time, with its code and its phone. */
  #sweep(): void {
    const now = this.#clock.now().getTime();
    for (const desk of this.#desks.values()) {
      if (desk.sink || desk.offlineSince === undefined) continue;
      if (now - desk.offlineSince <= this.#options.deskGraceSeconds * 1000) continue;
      this.#clearCode(desk);
      if (desk.phone) this.#deskByToken.delete(desk.phone.tokenHash);
      this.#desks.delete(desk.id);
    }
  }
}
