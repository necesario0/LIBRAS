import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type pg from "pg";
import { createAuditLog } from "../src/audit/index.ts";
import type { AuditEvent, AuditLog } from "../src/audit/index.ts";
import { withIdentity } from "../src/auth/index.ts";
import { withTransaction } from "../src/db.ts";
import { createTestMember, startTestApi } from "../src/testing/index.ts";
import type { TestApi } from "../src/testing/index.ts";

const failedSignIn = (subject: string | null = `someone-${randomUUID().slice(0, 8)}@umak.edu.ph`): AuditEvent => ({
  type: "sign_in_failed",
  subject,
  data: { portal: "member", reason: "invalid_credentials", clientAddress: "203.0.113.7" },
});

/** Runs `sql` and says whether PostgreSQL allowed it, inside a savepoint so the transaction goes on. */
async function attempt(client: pg.PoolClient, sql: string): Promise<"allowed" | string> {
  await client.query("savepoint attempt");
  try {
    await client.query(sql);
    await client.query("release savepoint attempt");
    return "allowed";
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return (error as Error).message;
  }
}

/**
 * Runs `work` in a transaction that is always rolled back, so a test can tamper
 * with the log (which needs the owner to switch off the refusal trigger) without
 * leaving the shared database changed.
 */
async function insideRolledBackTransaction(api: TestApi, work: (client: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await api.db.connect();
  try {
    await client.query("begin");
    await work(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

describe("the audit log", () => {
  let api: TestApi;
  let audit: AuditLog;

  before(async () => {
    api = await startTestApi();
    audit = createAuditLog({ db: api.db, clock: api.clock });
  });
  after(() => api.close());

  describe("recording", () => {
    it("chains each entry to the one before it with a SHA-256 hash", async () => {
      const first = await audit.record(failedSignIn());
      const second = await audit.record(failedSignIn());

      assert.equal(second.seq, first.seq + 1);
      assert.equal(second.prevHash, first.hash);
      assert.match(first.hash, /^[0-9a-f]{64}$/);
      assert.notEqual(first.hash, second.hash);
    });

    it("takes the time from the API clock", async () => {
      api.clock.set("2026-11-24T09:00:00.456Z");
      const entry = await audit.record(failedSignIn());
      assert.equal(entry.occurredAt.toISOString(), "2026-11-24T09:00:00.456Z");
    });

    it("refuses an event outside the whitelist, or with a field the whitelist does not list", async () => {
      const unknownType = { type: "loan_deleted", data: {} } as unknown as AuditEvent;
      const extraField = {
        type: "sign_in_failed",
        subject: null,
        data: { portal: "member", reason: "invalid_credentials", clientAddress: null, password: "hunter22" },
      } as unknown as AuditEvent;

      await assert.rejects(audit.record(unknownType), /Unknown audit event type/);
      await assert.rejects(audit.record(extraField), (error: Error) => {
        assert.match(error.message, /data/);
        assert.ok(!error.message.includes("hunter22"), "the refused value must not be echoed");
        return true;
      });
    });

    it("lets the database itself refuse an event type that is not whitelisted", async () => {
      await assert.rejects(
        api.db.query("insert into public.audit_log (occurred_at, event_type) values (now(), 'loan_deleted')"),
        /foreign key/,
      );
    });

    it("hashes awkward text the same way the API verifies it", async () => {
      const awkward = `quote " back \\ newline \n tab \t bell \u0007 del \u007f é ñ 漢字 😀 </script>`;
      await audit.record(failedSignIn(null));
      // Data holds only whitelisted fields, so put the awkward text where text goes: the client address field.
      await audit.record({
        type: "sign_in_failed",
        subject: "awkward.name+tag@umak.edu.ph",
        data: { portal: "staff", reason: "refused", clientAddress: awkward.slice(0, 64) },
      });
      const verification = await audit.verify();
      assert.equal(verification.intact, true, JSON.stringify(verification));
    });

    it("keeps an entry recorded inside a transaction only if that transaction commits", async () => {
      const subject = `rolled-back-${randomUUID().slice(0, 8)}@umak.edu.ph`;
      const before = await audit.newest();

      await assert.rejects(
        withTransaction(api.db, async (tx) => {
          await audit.record(failedSignIn(subject), tx);
          throw new Error("the change this entry belonged to failed");
        }),
      );
      const kept = await withTransaction(api.db, (tx) => audit.record(failedSignIn(), tx));

      const added = await audit.entries({ afterSeq: before?.seq ?? 0 });
      assert.deepEqual(added.map((entry) => entry.seq), [kept.seq]);
      assert.equal(kept.seq, (before?.seq ?? 0) + 1, "a rolled-back entry leaves no gap");
      assert.equal((await audit.verify()).intact, true);
    });

    it("keeps one unbroken chain when many writers record at once", async () => {
      const before = await audit.newest();
      const writers = 24;

      // Each writer holds its transaction open for a moment after recording, so they overlap.
      await Promise.all(
        Array.from({ length: writers }, (_, i) =>
          withTransaction(api.db, async (tx) => {
            await tx.query("select pg_sleep($1)", [(i % 4) * 0.01]);
            await audit.record(failedSignIn(), tx);
            await tx.query("select pg_sleep(0.02)");
          }),
        ),
      );
      await Promise.all(Array.from({ length: writers }, () => audit.record(failedSignIn())));

      const added = await audit.entries({ afterSeq: before?.seq ?? 0 });
      assert.equal(added.length, writers * 2);
      added.forEach((entry, i) => {
        assert.equal(entry.seq, (before?.seq ?? 0) + i + 1);
        if (i > 0) assert.equal(entry.prevHash, added[i - 1]?.hash);
      });
      assert.equal((await audit.verify()).intact, true);
    });

    it("refuses to record inside a REPEATABLE READ transaction, where the chain could fork", async () => {
      const client = await api.db.connect();
      try {
        await client.query("begin isolation level repeatable read");
        await assert.rejects(audit.record(failedSignIn(), client), /READ COMMITTED/);
      } finally {
        await client.query("rollback");
        client.release();
      }
    });

    it("ignores a sequence number or hash that the writer tries to supply", async () => {
      const newest = await audit.newest();
      const { rows } = await api.db.query<{ seq: string; prev_hash: string; hash: string }>(
        `insert into public.audit_log (seq, occurred_at, event_type, prev_hash, hash)
         values (1, now(), 'sign_in_failed', repeat('a', 64), repeat('b', 64)) returning seq, prev_hash, hash`,
      );
      assert.equal(Number(rows[0]?.seq), (newest?.seq ?? 0) + 1);
      assert.equal(rows[0]?.prev_hash, newest?.hash);
      assert.notEqual(rows[0]?.hash, "b".repeat(64));
      assert.equal((await audit.verify()).intact, true);
    });
  });

  describe("append-only", () => {
    it("refuses updates, deletes and TRUNCATE, even from the role the API and migrations use", async () => {
      await audit.record(failedSignIn());
      await insideRolledBackTransaction(api, async (client) => {
        const outcomes = [
          await attempt(client, "update public.audit_log set subject = 'someone-else@umak.edu.ph'"),
          await attempt(client, "delete from public.audit_log"),
          await attempt(client, "truncate public.audit_log"),
          await attempt(client, "delete from public.audit_event_types"),
        ];
        for (const outcome of outcomes) assert.match(outcome, /append-only/);
      });
    });

    it("still refuses them when triggers are switched to replica mode", async () => {
      await insideRolledBackTransaction(api, async (client) => {
        const replica = await attempt(client, "set local session_replication_role = replica");
        if (replica !== "allowed") {
          // This role may not even switch modes: nothing further to prove.
          assert.match(replica, /permission denied/);
          return;
        }
        assert.match(await attempt(client, "delete from public.audit_log"), /append-only/);
      });
    });

    it("refuses every change, and any read, to the Supabase client roles", async () => {
      await insideRolledBackTransaction(api, async (client) => {
        for (const role of ["anon", "authenticated", "service_role"]) {
          await client.query(`set local role ${role}`);
          for (const sql of [
            "select 1 from public.audit_log",
            "update public.audit_log set subject = null",
            "delete from public.audit_log",
            "truncate public.audit_log",
            "insert into public.audit_log (occurred_at, event_type) values (now(), 'sign_in_failed')",
          ]) {
            assert.match(await attempt(client, sql), /permission denied/, `${role}: ${sql}`);
          }
          await client.query("reset role");
        }
      });
    });

    it("is not readable by a signed-in Member through row-level security", async () => {
      const member = await createTestMember(api);
      const outcome = await withIdentity(api.db, { userId: member.member.id, email: member.email }, async (scope) => {
        try {
          await scope.query("select * from public.audit_log");
          return "allowed";
        } catch (error) {
          return (error as Error).message;
        }
      });
      assert.match(outcome, /permission denied/);
    });
  });

  describe("verification", () => {
    it("reports an intact chain and its newest entry", async () => {
      const newest = await audit.record(failedSignIn());
      const verification = await audit.verify();
      assert.deepEqual(verification.intact && verification.head, { seq: newest.seq, hash: newest.hash });
    });

    /** Switches off the refusal trigger inside a rolled-back transaction: what an owner who tampers can do. */
    async function tampered(work: (client: pg.PoolClient) => Promise<void>) {
      let result: Awaited<ReturnType<AuditLog["verify"]>> | undefined;
      await insideRolledBackTransaction(api, async (client) => {
        await client.query("alter table public.audit_log disable trigger audit_log_no_update_or_delete");
        await work(client);
        result = await audit.verify({ in: client });
      });
      assert.ok(result);
      return result;
    }

    it("detects an entry whose content was changed", async () => {
      const target = await audit.record(failedSignIn());
      await audit.record(failedSignIn());

      const result = await tampered(async (client) => {
        await client.query("update public.audit_log set subject = 'innocent@umak.edu.ph' where seq = $1", [target.seq]);
      });

      assert.deepEqual(result.intact ? undefined : [result.problem.kind, result.problem.seq], ["content_changed", target.seq]);
    });

    it("detects a changed entry even when its hash was recomputed the way the database does", async () => {
      const target = await audit.record(failedSignIn());
      await audit.record(failedSignIn());

      const result = await tampered(async (client) => {
        await client.query(
          `update public.audit_log set subject = 'innocent@umak.edu.ph',
             hash = encode(sha256(convert_to(public.audit_entry_canonical(prev_hash, seq, occurred_at, event_type, actor_id,
               'innocent@umak.edu.ph', data), 'UTF8')), 'hex')
           where seq = $1`,
          [target.seq],
        );
      });

      // The next entry still points at the old hash.
      assert.deepEqual(result.intact ? undefined : [result.problem.kind, result.problem.seq], ["broken_link", target.seq + 1]);
    });

    it("detects a deleted entry", async () => {
      const target = await audit.record(failedSignIn());
      await audit.record(failedSignIn());

      const result = await tampered(async (client) => {
        await client.query("delete from public.audit_log where seq = $1", [target.seq]);
      });

      assert.deepEqual(result.intact ? undefined : [result.problem.kind, result.problem.seq], ["missing_entry", target.seq + 1]);
    });

    /** Moves the given entries far out of the way and back to new numbers, so no step collides with a primary key. */
    async function renumber(client: pg.PoolClient, moves: [from: number, to: number][]) {
      const offset = 1_000_000_000;
      for (const [from] of moves) await client.query("update public.audit_log set seq = seq + $2 where seq = $1", [from, offset]);
      for (const [from, to] of moves) await client.query("update public.audit_log set seq = $2 where seq = $1", [from + offset, to]);
    }

    it("detects a deleted entry whose successors were renumbered to close the gap", async () => {
      const target = await audit.record(failedSignIn());
      const next = await audit.record(failedSignIn());
      const last = await audit.record(failedSignIn());

      const result = await tampered(async (client) => {
        await client.query("delete from public.audit_log where seq = $1", [target.seq]);
        await renumber(client, [
          [next.seq, target.seq],
          [last.seq, next.seq],
        ]);
      });

      assert.deepEqual(result.intact ? undefined : [result.problem.kind, result.problem.seq], ["broken_link", target.seq]);
    });

    it("detects two entries that swapped places", async () => {
      const a = await audit.record(failedSignIn());
      const b = await audit.record(failedSignIn());

      const result = await tampered(async (client) => {
        await renumber(client, [
          [a.seq, b.seq],
          [b.seq, a.seq],
        ]);
      });

      assert.deepEqual(result.intact ? undefined : [result.problem.kind, result.problem.seq], ["broken_link", a.seq]);
    });

    it("detects a removed newest entry only with an anchor kept outside the database", async () => {
      const newest = await audit.record(failedSignIn());
      const anchor = { seq: newest.seq, hash: newest.hash };

      let withAnchor: Awaited<ReturnType<AuditLog["verify"]>> | undefined;
      const withoutAnchor = await tampered(async (client) => {
        await client.query("delete from public.audit_log where seq = $1", [newest.seq]);
        withAnchor = await audit.verify({ in: client, anchor });
      });

      assert.equal(withoutAnchor.intact, true, "a shortened chain looks intact on its own: the known limit");
      assert.deepEqual(withAnchor?.intact ? undefined : [withAnchor?.problem.kind, withAnchor?.problem.seq], [
        "missing_entry",
        newest.seq,
      ]);
      assert.equal((await audit.verify({ anchor })).intact, true);
      const forged = await audit.verify({ anchor: { seq: newest.seq, hash: "f".repeat(64) } });
      assert.deepEqual(forged.intact ? undefined : forged.problem.kind, "anchor_mismatch");
    });
  });
});
