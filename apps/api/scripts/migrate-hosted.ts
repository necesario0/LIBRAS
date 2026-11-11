// Applies supabase/migrations to the hosted database: `npm run db:migrate:hosted`.
//
//   npm run db:migrate:hosted                   preview the pending migrations, ask, then apply
//   npm run db:migrate:hosted -- --dry-run      preview only, change nothing
//   npm run db:migrate:hosted -- --yes          preview, then apply without asking (for scripts)
//
// The target is DATABASE_URL from .env.hosted (written by `npm run setup:hosted`):
// the Supabase session pooler connection string. Only migrations that are not
// yet recorded in the database's history are applied, so running it again is
// safe. The password goes to the Supabase CLI through PGPASSWORD, never on its
// command line, and is never printed.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { describeTarget, parseHostedDatabaseUrl } from "./hosted-database.ts";
import type { HostedTarget } from "./hosted-database.ts";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => arg !== "--dry-run" && arg !== "--yes");
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}. Use --dry-run or --yes.`);
  process.exit(2);
}
const dryRun = args.has("--dry-run");
const assumeYes = args.has("--yes");

let target: HostedTarget;
try {
  target = parseHostedDatabaseUrl(process.env.DATABASE_URL);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

/** Runs the Supabase CLI against the hosted database. Its output is shown as it comes. */
function push(extra: string[]): number {
  const command = ["npx", "supabase", "db", "push", `--remote=${target.urlWithoutPassword}`, ...extra].map((part) => `"${part}"`).join(" ");
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    // PGSSLMODE makes the Supabase CLI refuse an unencrypted connection.
    env: { ...process.env, PGPASSWORD: target.password, PGSSLMODE: "require" },
  });
  return result.status ?? 1;
}

console.log(`Hosted database: ${describeTarget(target)}\n`);
console.log("Migrations that would be applied (nothing is changed yet):\n");
const previewStatus = push(["--dry-run"]);
if (previewStatus !== 0) {
  console.error("\nCould not read the hosted database. Check DATABASE_URL and that the Supabase project is running.");
  process.exit(previewStatus);
}
if (dryRun) process.exit(0);

if (!assumeYes) {
  if (!process.stdin.isTTY) {
    console.error("\nNot a terminal, so there is nobody to confirm. Run it from a terminal, or add --yes.");
    process.exit(1);
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`\nApply them to ${target.host}? Type "apply" to continue: `);
  prompt.close();
  if (answer.trim().toLowerCase() !== "apply") {
    console.log("Nothing applied.");
    process.exit(0);
  }
}

console.log("\nApplying...\n");
const status = push(["--yes"]);
console.log(status === 0 ? "\nDone. The hosted database is up to date." : "\nThe migration failed. Read the error above, fix the cause and run the command again.");
process.exit(status);
