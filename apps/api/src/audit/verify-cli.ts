// Checks the audit log's hash chain: `npm run audit:verify -w @libras/api`.
// Reads DATABASE_URL (default: the local Supabase database) and DATABASE_CA_CERT.
// Pass `--anchor <seq>:<hash>` (a head printed by an earlier run and kept
// outside the database) to also detect a chain that was cut short or rewritten.
// Exits 0 when the chain is intact, 1 when it is not, 2 on a usage error.
import { systemClock } from "../clock.ts";
import { LOCAL_DATABASE_URL } from "../config.ts";
import { createDatabase } from "../db.ts";
import { createAuditLog } from "./audit-log.ts";
import type { AuditAnchor } from "./audit-log.ts";

function parseAnchor(args: readonly string[]): AuditAnchor | undefined {
  const index = args.indexOf("--anchor");
  if (index === -1) return undefined;
  const match = /^(\d+):([0-9a-f]{64})$/.exec(args[index + 1] ?? "");
  if (!match?.[1] || !match[2]) {
    console.error("Usage: verify-cli.ts [--anchor <seq>:<64 hex characters>]");
    process.exit(2);
  }
  return { seq: Number(match[1]), hash: match[2] };
}

const anchor = parseAnchor(process.argv.slice(2));
const db = createDatabase(process.env.DATABASE_URL || LOCAL_DATABASE_URL, console, process.env.DATABASE_CA_CERT || undefined);
try {
  const verification = await createAuditLog({ db, clock: systemClock }).verify({ anchor });
  if (verification.intact) {
    const head = verification.head ? `${verification.head.seq}:${verification.head.hash}` : "(empty)";
    console.log(`Audit log intact: ${verification.checked} entries checked. Head: ${head}`);
  } else {
    console.error(`Audit log NOT intact after ${verification.checked} good entries.`);
    console.error(`${verification.problem.kind} at entry ${verification.problem.seq}: ${verification.problem.message}`);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
