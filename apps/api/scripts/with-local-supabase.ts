// Runs a command with the Supabase settings of the local stack in its environment.
//
//   node scripts/with-local-supabase.ts <command> [args...]
//
// The API needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and (scripts and tests
// only) SUPABASE_SECRET_KEY. No key lives in the source: this script reads them
// from the running local stack with `npx supabase status -o env` and passes them
// on, so the dev, test, seed and end-to-end scripts need no setup beyond
// `npm run db:start`.
//
// A variable that is already set always wins (in the environment or in the
// repository .env file), and nothing is looked up when all three are set or when
// NODE_ENV=production: production uses explicit environment variables only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Environment variable the API reads -> the name `supabase status -o env` prints it under. */
const LOCAL_STACK_NAMES = {
  SUPABASE_URL: "API_URL",
  SUPABASE_PUBLISHABLE_KEY: "PUBLISHABLE_KEY",
  SUPABASE_SECRET_KEY: "SECRET_KEY",
} as const;

/** Parses the `NAME="value"` lines that `supabase status -o env` prints. */
function parseStatusEnv(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

/** The Supabase settings in the repository's .env file, which the API itself also reads. */
function readEnvFile(): NodeJS.Dict<string> {
  const file = new URL("../../../.env", import.meta.url);
  if (!existsSync(file)) return {};
  const values = parseEnv(readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(values).filter(([name, value]) => name in LOCAL_STACK_NAMES && value));
}

function readLocalStack(): Map<string, string> {
  const result = spawnSync("npx supabase status -o env", { shell: true, encoding: "utf8" });
  const values = parseStatusEnv(result.stdout ?? "");
  if (result.status !== 0 || !values.has("API_URL")) {
    process.stderr.write(
      "Could not read the Supabase settings from the local stack. Is it running? Start it with `npm run db:start`.\n" +
        "Or set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY yourself.\n" +
        (result.stderr ?? ""),
    );
    process.exit(1);
  }
  return values;
}

/** Quotes one argument for the shell that runs the command (sh or cmd.exe). */
function quote(argument: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(argument) ? argument : `"${argument.replaceAll('"', '\\"')}"`;
}

function main(): void {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    process.stderr.write("Usage: node scripts/with-local-supabase.ts <command> [args...]\n");
    process.exit(2);
  }

  const env = { ...readEnvFile(), ...process.env };
  const missing = Object.keys(LOCAL_STACK_NAMES).filter((name) => !env[name]);
  if (missing.length > 0 && env.NODE_ENV !== "production") {
    const stack = readLocalStack();
    for (const name of missing) {
      const value = stack.get(LOCAL_STACK_NAMES[name as keyof typeof LOCAL_STACK_NAMES]);
      if (value) env[name] = value;
    }
  }

  const result = spawnSync(command.map(quote).join(" "), { shell: true, stdio: "inherit", env });
  process.exit(result.status ?? 1);
}

main();
