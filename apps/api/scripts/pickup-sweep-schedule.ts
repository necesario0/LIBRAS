// The database-side schedule of the Pickup Window sweep (ADR 0007), as SQL that
// `npm run schedule:hosted` runs against the hosted Supabase database, and the
// tests run against the local one.
//
// pg_cron calls pg_net every few minutes to POST the API's sweep endpoint with
// the shared secret. The request wakes a service that Render has put to sleep,
// and the API then ends every Pickup Window that has passed. The API address
// and the secret are kept in Supabase Vault and read by the job when it runs,
// so neither appears in the job's text (`cron.job` is readable by more roles
// than the vault is).
import type { Database } from "../src/db.ts";
import { MIN_SWEEP_SECRET_LENGTH } from "../src/config.ts";

/** The API's sweep endpoint, after its address. */
export const PICKUP_SWEEP_PATH = "/internal/sweeps/pickup-expiry";
export const PICKUP_SWEEP_JOB = "libras-pickup-expiry";
/** Every five minutes: a Pickup Window ends at most that long before the API hears of it, even from sleep. */
export const PICKUP_SWEEP_SCHEDULE = "*/5 * * * *";

/** How long the job waits for the API to answer, which includes Render waking the service (about a minute). */
const REQUEST_TIMEOUT_MS = 90_000;

export interface PickupSweepSchedule {
  /** The API's address, https://..., with no path. */
  apiUrl: string;
  /** The same value as the API's SWEEP_SECRET. */
  secret: string;
  jobName?: string;
  /** A cron expression. */
  schedule?: string;
}

function checkedJobName(jobName: string): string {
  // The name ends up in the job's text, so it must be plain.
  if (!/^[a-z0-9-]{1,40}$/.test(jobName)) throw new Error("The job name may use only a-z, 0-9 and -");
  return jobName;
}

/** Stores a vault secret, replacing the value when the name exists. */
async function putSecret(db: Database, name: string, value: string, description: string): Promise<void> {
  const existing = await db.query<{ id: string }>("select id from vault.secrets where name = $1", [name]);
  if (existing.rows[0]) await db.query("select vault.update_secret($1, $2, $3, $4)", [existing.rows[0].id, value, name, description]);
  else await db.query("select vault.create_secret($1, $2, $3)", [value, name, description]);
}

/**
 * Enables pg_cron and pg_net, stores the API address and the secret in the
 * vault and (re)schedules the job. Safe to run again: it replaces the job and
 * the secrets, never adding a second job.
 */
export async function schedulePickupSweep(db: Database, options: PickupSweepSchedule): Promise<void> {
  const jobName = checkedJobName(options.jobName ?? PICKUP_SWEEP_JOB);
  const apiUrl = options.apiUrl.replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(apiUrl)) throw new Error("The API address must be https://host, with no path: the secret travels in the request");
  if (options.secret.length < MIN_SWEEP_SECRET_LENGTH) throw new Error(`The sweep secret must be at least ${MIN_SWEEP_SECRET_LENGTH} characters`);
  const schedule = options.schedule ?? PICKUP_SWEEP_SCHEDULE;

  await db.query("create extension if not exists pg_cron with schema pg_catalog");
  await db.query("create extension if not exists pg_net with schema extensions");
  await putSecret(db, `${jobName}_url`, `${apiUrl}${PICKUP_SWEEP_PATH}`, "The API's Pickup Window sweep endpoint");
  await putSecret(db, `${jobName}_secret`, options.secret, "The API's SWEEP_SECRET");

  const command = `select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '${jobName}_url'),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${jobName}_secret')
  ),
  timeout_milliseconds := ${REQUEST_TIMEOUT_MS}
)`;
  // cron.schedule with a name that exists updates that job.
  await db.query("select cron.schedule($1, $2, $3)", [jobName, schedule, command]);
}

/** Removes the job and its vault secrets. */
export async function unschedulePickupSweep(db: Database, options: { jobName?: string } = {}): Promise<void> {
  const jobName = checkedJobName(options.jobName ?? PICKUP_SWEEP_JOB);
  await db.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [jobName]);
  await db.query("delete from vault.secrets where name = any($1)", [[`${jobName}_url`, `${jobName}_secret`]]);
}
