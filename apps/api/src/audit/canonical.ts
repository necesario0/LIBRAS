import { createHash } from "node:crypto";

/**
 * The canonical serialisation of an audit entry, built the same way as
 * `public.audit_entry_canonical` in the audit log migration, which is what the
 * database hashes when it appends. Verification rebuilds the text here, in the
 * API, so a change made inside the database cannot also change how it is checked.
 *
 * Format (version 1): a JSON array with no whitespace,
 *   ["libras-audit-v1", prevHash, seq, occurredAt, type, actorId, subject, data]
 * where occurredAt is ISO 8601 UTC to the millisecond, absent values are null,
 * and data is canonical JSON: object keys sorted, strings escaped as
 * JSON.stringify does (PostgreSQL's to_json escapes the same characters the
 * same way), integers only.
 */
export const AUDIT_FORMAT_VERSION = "libras-audit-v1";

/** The previous hash of the first entry. */
export const GENESIS_HASH = "0".repeat(64);

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error("Audit data numbers must be safe integers");
      return String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>);
      for (const [key] of entries) {
        if (!KEY_PATTERN.test(key)) throw new Error("Audit data keys must be ASCII identifiers");
      }
      // ASCII keys only, so code-unit order equals PostgreSQL's byte order (collate "C").
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    default:
      throw new Error(`Audit data cannot hold a ${typeof value}`);
  }
}

export interface HashedContent {
  prevHash: string;
  seq: number;
  occurredAt: Date;
  type: string;
  actorId: string | null;
  subject: string | null;
  data: unknown;
}

export function canonicalEntry(entry: HashedContent): string {
  return `[${[
    JSON.stringify(AUDIT_FORMAT_VERSION),
    JSON.stringify(entry.prevHash),
    String(entry.seq),
    JSON.stringify(entry.occurredAt.toISOString()),
    JSON.stringify(entry.type),
    entry.actorId === null ? "null" : JSON.stringify(entry.actorId),
    entry.subject === null ? "null" : JSON.stringify(entry.subject),
    canonicalJson(entry.data),
  ].join(",")}]`;
}

/** SHA-256 of the canonical entry, as lowercase hex: what the database stores in `hash`. */
export function entryHash(entry: HashedContent): string {
  return createHash("sha256").update(canonicalEntry(entry), "utf8").digest("hex");
}
