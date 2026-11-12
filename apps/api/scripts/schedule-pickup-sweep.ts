// Sets up (or removes) the database schedule that ends Pickup Windows even while
// the hosted API sleeps (ADR 0007): `npm run schedule:hosted`.
//
//   npm run schedule:hosted              install or update the schedule
//   npm run schedule:hosted -- --remove  remove it
//
// It reads .env.hosted (written by `npm run setup:hosted`): DATABASE_URL, and the
// service address EXPO_PUBLIC_API_URL. SWEEP_SECRET is read from there too; when it
// is missing a new one is generated and saved to .env.hosted, and copied to the
// clipboard when possible. The secret is never printed. Whatever it is, the same
// value must be set as SWEEP_SECRET on the Render service (Environment tab): the
// script then asks the API once whether it accepts the secret.
//
// Needs the hosted database to be migrated first (`npm run db:migrate:hosted`).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/db.ts";
import { consoleLogger } from "../src/logger.ts";
import { describeTarget, parseHostedDatabaseUrl } from "./hosted-database.ts";
import { PICKUP_SWEEP_JOB, PICKUP_SWEEP_PATH, PICKUP_SWEEP_SCHEDULE, schedulePickupSweep, unschedulePickupSweep } from "./pickup-sweep-schedule.ts";

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const unknown = args.filter((arg) => arg !== "--remove");
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}. Use --remove, or nothing to install.`);
  process.exit(2);
}

const envFile = fileURLToPath(new URL("../../../.env.hosted", import.meta.url));

/** A new secret saved to .env.hosted, so it survives this run and the developer can copy it from there. */
function newSecret(): string {
  const secret = randomBytes(32).toString("hex");
  const existing = (() => {
    try {
      return readFileSync(envFile, "utf8");
    } catch {
      return "";
    }
  })();
  appendFileSync(envFile, `${existing === "" || existing.endsWith("\n") ? "" : "\n"}SWEEP_SECRET=${secret}\n`);
  // Windows has clip.exe; elsewhere the developer copies it from the file.
  spawnSync("clip.exe", { input: secret, stdio: ["pipe", "ignore", "ignore"] });
  return secret;
}

async function main(): Promise<number> {
  const target = parseHostedDatabaseUrl(process.env.DATABASE_URL);
  const db = createDatabase(process.env.DATABASE_URL as string, consoleLogger, process.env.DATABASE_CA_CERT || undefined);
  console.log(`Hosted database: ${describeTarget(target)}`);
  try {
    if (remove) {
      await unschedulePickupSweep(db);
      console.log(`Removed the job ${PICKUP_SWEEP_JOB} and its secrets.`);
      return 0;
    }

    const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
    if (!apiUrl) throw new Error("EXPO_PUBLIC_API_URL is not set in .env.hosted. Run `npm run setup:hosted` first: it saves the service address.");
    let secret = process.env.SWEEP_SECRET;
    if (!secret) {
      secret = newSecret();
      console.log(`\nMade a new SWEEP_SECRET and saved it to ${envFile} (and the clipboard, if it has one).`);
    }

    await schedulePickupSweep(db, { apiUrl, secret });
    console.log(`\nScheduled ${PICKUP_SWEEP_JOB} (${PICKUP_SWEEP_SCHEDULE}) to call ${apiUrl}${PICKUP_SWEEP_PATH}.`);
    console.log("\nOne more thing, in the Render dashboard: open the libras-api service, Environment tab, and add");
    console.log("SWEEP_SECRET with the value saved in .env.hosted. Render restarts the service when you save.");

    console.log("\nAsking the API whether it accepts the secret (a sleeping service takes about a minute to wake)...");
    const response = await fetch(`${apiUrl}${PICKUP_SWEEP_PATH}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    }).catch(() => undefined);
    if (response?.ok) {
      console.log(`The API answered ${response.status}: the schedule works. ${JSON.stringify(await response.json().catch(() => ({})))}`);
      return 0;
    }
    const hint =
      response === undefined
        ? "The API did not answer. Check the service in the Render dashboard, then run this command again."
        : response.status === 404
          ? "The API has no sweep endpoint yet: SWEEP_SECRET is not set on the Render service, or the service runs an older version."
          : response.status === 401
            ? "The API refused the secret: the SWEEP_SECRET on the Render service differs from the one in .env.hosted."
            : `The API answered ${response.status}.`;
    console.error(`${hint} The schedule is installed; run \`npm run check:hosted\` once the service is up, and this command again to check.`);
    return 1;
  } finally {
    await db.end();
  }
}

try {
  // exitCode, not process.exit: exiting while a request is closing trips a libuv assertion on Windows.
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "The schedule could not be set up");
  process.exitCode = 1;
}
