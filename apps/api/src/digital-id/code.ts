import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { DIGITAL_ID_NUMBER_DIGITS, DIGITAL_ID_TOKEN_DIGITS, DIGITAL_ID_WINDOW_SECONDS } from "@libras/shared";

/**
 * How a Digital ID is derived (ADR 0004): pure functions, no I/O.
 *
 * The token is HOTP (RFC 4226) over the number of the 60-second window since
 * the Unix epoch, which is TOTP (RFC 6238) with a 60-second step, using
 * HMAC-SHA-256 and a 32-byte per-Member secret.
 */

export const WINDOW_MS = DIGITAL_ID_WINDOW_SECONDS * 1000;
export const SECRET_BYTES = 32;

/** The window a moment falls in: whole 60-second steps since 1970-01-01T00:00:00Z. */
export function windowOf(time: Date): number {
  return Math.floor(time.getTime() / WINDOW_MS);
}

export function windowStart(window: number): Date {
  return new Date(window * WINDOW_MS);
}

/** A new secret from the operating system's CSPRNG. */
export function newSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

/** A random Digital ID number (CSPRNG), leading zeros kept. */
export function newIdNumber(): string {
  return String(randomInt(0, 10 ** DIGITAL_ID_NUMBER_DIGITS)).padStart(DIGITAL_ID_NUMBER_DIGITS, "0");
}

/** The 6-digit token for one window: HMAC-SHA-256 of the 8-byte big-endian window number, dynamically truncated. */
export function tokenFor(secret: Buffer, window: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(window));
  const mac = createHmac("sha256", secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITAL_ID_TOKEN_DIGITS).padStart(DIGITAL_ID_TOKEN_DIGITS, "0");
}

/** Compares two tokens in time that does not depend on where they differ. */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
