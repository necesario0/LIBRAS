import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createDatabase } from "../src/db.ts";
import type { Database } from "../src/db.ts";
import { LOCAL_DATABASE_URL } from "../src/config.ts";
import { consoleLogger } from "../src/logger.ts";
import { PICKUP_SWEEP_PATH, schedulePickupSweep, unschedulePickupSweep } from "../scripts/pickup-sweep-schedule.ts";

const JOB = "libras-test-pickup-expiry";
const SECRET = "schedule-test-secret-0123456789abcdef01234567";

/** The database-side schedule that wakes the hosted API, against the local Supabase PostgreSQL (it has pg_cron, pg_net and the vault). */
describe("The database schedule of the Pickup Window sweep", () => {
  let db: Database;

  const jobs = async () => (await db.query<{ schedule: string; command: string }>("select schedule, command from cron.job where jobname = $1", [JOB])).rows;
  const secrets = async () => (await db.query<{ name: string }>("select name from vault.secrets where name like $1", [`${JOB}%`])).rows.map((row) => row.name);

  before(() => {
    db = createDatabase(process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL, consoleLogger);
  });
  after(async () => {
    try {
      await unschedulePickupSweep(db, { jobName: JOB });
    } finally {
      await db.end();
    }
  });

  it("schedules one job that posts to the API's sweep endpoint, and keeps the API address and the secret in the vault, not in the job", async () => {
    await schedulePickupSweep(db, { apiUrl: "https://libras-api.example.com", secret: SECRET, jobName: JOB, schedule: "*/5 * * * *" });

    const [job, ...others] = await jobs();
    assert.equal(others.length, 0);
    assert.equal(job?.schedule, "*/5 * * * *");
    assert.match(job?.command ?? "", /net\.http_post/);
    assert.ok(!(job?.command ?? "").includes(SECRET), "the secret is not in the job's text");
    assert.ok(!(job?.command ?? "").includes("libras-api.example.com"), "the address is not in the job's text");
    assert.deepEqual((await secrets()).sort(), [`${JOB}_secret`, `${JOB}_url`]);
    const stored = await db.query<{ name: string; decrypted_secret: string }>(
      "select name, decrypted_secret from vault.decrypted_secrets where name like $1 order by name",
      [`${JOB}%`],
    );
    assert.deepEqual(
      stored.rows.map((row) => [row.name, row.decrypted_secret]),
      [
        [`${JOB}_secret`, SECRET],
        [`${JOB}_url`, `https://libras-api.example.com${PICKUP_SWEEP_PATH}`],
      ],
    );
  });

  it("runs the job's command: pg_net accepts a request for it, with the secret as a bearer token", async () => {
    const [job] = await jobs();

    const result = await db.query<{ http_post: string }>(job?.command ?? "select 1/0");

    const id = result.rows[0]?.http_post;
    assert.ok(id !== undefined && Number(id) > 0, "pg_net returned a request id");
    const queued = await db.query<{ url: string; headers: Record<string, string> }>("select url, headers from net.http_request_queue where id = $1", [id]);
    // The worker may have taken the request already: when it is still queued, check what it carries.
    if (queued.rows[0]) {
      assert.equal(queued.rows[0].url, `https://libras-api.example.com${PICKUP_SWEEP_PATH}`);
      assert.equal(queued.rows[0].headers.Authorization, `Bearer ${SECRET}`);
    }
  });

  it("updates the job, the address and the secret when run again, never adding a second job", async () => {
    await schedulePickupSweep(db, { apiUrl: "https://other.example.com", secret: `${SECRET}-new`, jobName: JOB, schedule: "*/10 * * * *" });

    assert.equal((await jobs()).length, 1);
    assert.equal((await jobs())[0]?.schedule, "*/10 * * * *");
    const stored = await db.query<{ name: string; decrypted_secret: string }>(
      "select name, decrypted_secret from vault.decrypted_secrets where name like $1 order by name",
      [`${JOB}%`],
    );
    assert.deepEqual(
      stored.rows.map((row) => row.decrypted_secret),
      [`${SECRET}-new`, `https://other.example.com${PICKUP_SWEEP_PATH}`],
    );
  });

  it("removes the job and its secrets", async () => {
    await unschedulePickupSweep(db, { jobName: JOB });

    assert.deepEqual(await jobs(), []);
    assert.deepEqual(await secrets(), []);
  });

  it("refuses an address that is not https, because the secret travels in the request", async () => {
    await assert.rejects(schedulePickupSweep(db, { apiUrl: "http://libras-api.example.com", secret: SECRET, jobName: JOB }), /https/);
    await assert.rejects(schedulePickupSweep(db, { apiUrl: "https://libras-api.example.com", secret: "short", jobName: JOB }), /at least 32/);
    assert.deepEqual(await jobs(), []);
  });
});
