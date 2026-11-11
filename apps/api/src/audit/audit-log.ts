import type pg from "pg";
import type { Clock } from "../clock.ts";
import type { Database } from "../db.ts";
import { GENESIS_HASH, entryHash } from "./canonical.ts";
import { parseAuditEvent } from "./events.ts";
import type { AuditEvent, AuditEventType } from "./events.ts";

/** Something to run SQL on: the pool, or the client of a transaction in progress. */
export type AuditExecutor = Pick<pg.PoolClient, "query">;

/** One entry as stored. `hash` chains to the previous entry's `hash` through `prevHash`. */
export interface AuditEntry {
  seq: number;
  occurredAt: Date;
  type: AuditEventType;
  actorId: string | null;
  subject: string | null;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

/** A point in the chain kept somewhere outside the database, to detect a rewritten or shortened chain. */
export interface AuditAnchor {
  seq: number;
  hash: string;
}

export type AuditProblemKind =
  /** An entry's content no longer gives its stored hash. */
  | "content_changed"
  /** An entry does not point at the hash of the entry before it (an entry was removed, reordered or replaced). */
  | "broken_link"
  /** A sequence number is missing (an entry was deleted). */
  | "missing_entry"
  /** The chain disagrees with an anchor kept outside the database. */
  | "anchor_mismatch";

export type AuditVerification =
  | { intact: true; checked: number; head: AuditAnchor | null }
  | { intact: false; checked: number; problem: { kind: AuditProblemKind; seq: number; message: string } };

export interface VerifyOptions {
  /** Verify inside this transaction instead of a fresh read-only one. */
  in?: AuditExecutor;
  /** Fail unless the chain holds this entry with this hash (and so is at least this long). */
  anchor?: AuditAnchor;
}

export interface AuditLog {
  /**
   * Appends one event. Time comes from the clock. Pass `tx` (the client of a
   * transaction, READ COMMITTED, the default) to record atomically with a
   * change: the entry exists only if that transaction commits, and other
   * writers of the log wait for it to end. Record as the last statement of the
   * transaction so the wait is short.
   */
  record(event: AuditEvent, tx?: AuditExecutor): Promise<AuditEntry>;
  /** The newest entry, or undefined when the log is empty. */
  newest(tx?: AuditExecutor): Promise<AuditEntry | undefined>;
  /** Entries after `afterSeq`, oldest first, at most `limit` (default 1000). */
  entries(options?: { afterSeq?: number; limit?: number }, tx?: AuditExecutor): Promise<AuditEntry[]>;
  /** Recomputes every hash from the start and checks each link. */
  verify(options?: VerifyOptions): Promise<AuditVerification>;
}

interface AuditRow {
  seq: string;
  occurred_at: Date;
  event_type: AuditEventType;
  actor_id: string | null;
  subject: string | null;
  data: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

const COLUMNS = "seq, occurred_at, event_type, actor_id, subject, data, prev_hash, hash";
const VERIFY_BATCH = 1000;

function fromRow(row: AuditRow): AuditEntry {
  const seq = Number(row.seq);
  if (!Number.isSafeInteger(seq)) throw new Error(`Audit sequence number out of range: ${row.seq}`);
  return {
    seq,
    occurredAt: row.occurred_at,
    type: row.event_type,
    actorId: row.actor_id,
    subject: row.subject,
    data: row.data,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

/**
 * The audit log (spec #2): append-only, each entry hash-chained to the one
 * before. The database assigns the sequence number and computes the hash
 * (migration `..._audit_log.sql`), and refuses updates, deletes and TRUNCATE.
 */
export function createAuditLog({ db, clock }: { db: Database; clock: Clock }): AuditLog {
  async function readBatch(executor: AuditExecutor, afterSeq: number, limit: number): Promise<AuditEntry[]> {
    const result = await executor.query<AuditRow>(
      `select ${COLUMNS} from public.audit_log where seq > $1 order by seq limit $2`,
      [afterSeq, limit],
    );
    return result.rows.map(fromRow);
  }

  async function verifyWith(executor: AuditExecutor, anchor: AuditAnchor | undefined): Promise<AuditVerification> {
    let checked = 0;
    let previous: AuditEntry | undefined;
    let anchorSeen = false;
    for (;;) {
      const batch = await readBatch(executor, previous?.seq ?? 0, VERIFY_BATCH);
      for (const entry of batch) {
        const expectedSeq = (previous?.seq ?? 0) + 1;
        const fail = (kind: AuditProblemKind, message: string): AuditVerification => ({
          intact: false,
          checked,
          problem: { kind, seq: entry.seq, message },
        });
        if (entry.seq !== expectedSeq) {
          return fail("missing_entry", `Entry ${expectedSeq} is missing: the next entry is ${entry.seq}.`);
        }
        if (entry.prevHash !== (previous?.hash ?? GENESIS_HASH)) {
          return fail("broken_link", `Entry ${entry.seq} does not follow the entry before it.`);
        }
        if (entryHash(entry) !== entry.hash) {
          return fail("content_changed", `Entry ${entry.seq} was changed after it was recorded.`);
        }
        if (anchor !== undefined && entry.seq === anchor.seq) {
          if (entry.hash !== anchor.hash) return fail("anchor_mismatch", `Entry ${entry.seq} differs from the anchor.`);
          anchorSeen = true;
        }
        checked += 1;
        previous = entry;
      }
      if (batch.length < VERIFY_BATCH) break;
    }
    if (anchor !== undefined && !anchorSeen) {
      return {
        intact: false,
        checked,
        problem: {
          kind: "missing_entry",
          seq: anchor.seq,
          message: `Entry ${anchor.seq} from the anchor is missing: the log ends at ${previous?.seq ?? 0}.`,
        },
      };
    }
    return { intact: true, checked, head: previous ? { seq: previous.seq, hash: previous.hash } : null };
  }

  return {
    async record(event, tx) {
      const { type, actorId, subject, data } = parseAuditEvent(event);
      // seq, prev_hash and hash are filled in by the database.
      const result = await (tx ?? db).query<AuditRow>(
        `insert into public.audit_log (occurred_at, event_type, actor_id, subject, data)
         values ($1, $2, $3, $4, $5::jsonb)
         returning ${COLUMNS}`,
        [clock.now(), type, actorId, subject, JSON.stringify(data)],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("The audit entry was not stored");
      return fromRow(row);
    },

    async newest(tx) {
      const result = await (tx ?? db).query<AuditRow>(`select ${COLUMNS} from public.audit_log order by seq desc limit 1`);
      const row = result.rows[0];
      return row === undefined ? undefined : fromRow(row);
    },

    async entries({ afterSeq = 0, limit = 1000 } = {}, tx) {
      return readBatch(tx ?? db, afterSeq, limit);
    },

    async verify({ in: tx, anchor } = {}) {
      if (tx !== undefined) return verifyWith(tx, anchor);
      // One snapshot for the whole read, so entries appended meanwhile cannot confuse the check.
      const client = await db.connect();
      try {
        await client.query("begin isolation level repeatable read read only");
        const verification = await verifyWith(client, anchor);
        await client.query("commit");
        client.release();
        return verification;
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
  };
}
