// The seed script: `npm run seed` (`npm run seed:hosted` for the hosted
// project). It makes the system demo-ready without an admin module: the
// Librarian account, the Loan Policy of every Account Type and the Pickup Window
// setting (also created by the migrations; existing values are kept), and the
// catalog. Safe to run again.
//
// The catalog is the library's real one, read from its accession list (a
// private workbook, never committed):
//
//   npm run seed                                  reads data/library-catalog.xlsx at the repository root
//   npm run seed -- --workbook <path to .xlsx>    reads that file instead
//   npm run seed -- --sample-catalog              writes the generated sample catalog instead
//
// Without the workbook and without --sample-catalog, the catalog is left as it is.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import { seedCatalog } from "./catalog.ts";
import { SEED_PICKUP_WINDOW_HOURS, seedCirculationSettings } from "./circulation.ts";
import { generateCatalog } from "./catalog-generator.ts";
import { seedLibrarians } from "./librarians.ts";
import type { LibrarianSeed } from "./librarians.ts";

/** Where the seed looks for the library's workbook when no path is given. Git-ignored (`/data/`). */
const DEFAULT_WORKBOOK = fileURLToPath(new URL("../../../../data/library-catalog.xlsx", import.meta.url));

/** The demo Librarian. Local only: a production seed must name the account and password itself. */
const LOCAL_LIBRARIAN: LibrarianSeed = {
  email: "librarian@libras.test",
  password: "librarian-demo-2026",
  fullName: "Demo Librarian",
};

function librarianFromEnvironment(env: NodeJS.ProcessEnv, isProduction: boolean): LibrarianSeed {
  const email = env.SEED_LIBRARIAN_EMAIL ?? (isProduction ? undefined : LOCAL_LIBRARIAN.email);
  const password = env.SEED_LIBRARIAN_PASSWORD ?? (isProduction ? undefined : LOCAL_LIBRARIAN.password);
  if (!email || !password) throw new Error("SEED_LIBRARIAN_EMAIL and SEED_LIBRARIAN_PASSWORD must be set in production");
  return { email, password, fullName: env.SEED_LIBRARIAN_NAME ?? LOCAL_LIBRARIAN.fullName };
}

type CatalogSource = { kind: "workbook"; path: string; given: boolean } | { kind: "sample" };

function catalogSource(argv: readonly string[]): CatalogSource {
  let source: CatalogSource = { kind: "workbook", path: DEFAULT_WORKBOOK, given: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sample-catalog") source = { kind: "sample" };
    else if (arg === "--workbook") {
      const path = argv[++i];
      if (!path) throw new Error("--workbook needs the path of the library's .xlsx file");
      // npm runs the script from apps/api; a relative path means relative to where the command was typed.
      source = { kind: "workbook", path: resolve(process.env.INIT_CWD ?? process.cwd(), path), given: true };
    } else throw new Error(`Unknown option ${arg}. Use --workbook <path> or --sample-catalog.`);
  }
  return source;
}

const source = catalogSource(process.argv.slice(2));
const config = loadConfig();
const db = createDatabase(config.databaseUrl, console, config.databaseCaCertificate);
try {
  const librarian = librarianFromEnvironment(process.env, config.isProduction);
  await seedLibrarians(db, [librarian]);
  console.log(`Librarian ready: ${librarian.email}`);
  await seedCirculationSettings(db);
  console.log(`Loan Policy and Pickup Window ready (seeded as ${SEED_PICKUP_WINDOW_HOURS} hours; existing values kept)`);
  if (source.kind === "sample") {
    const catalog = await seedCatalog(db, generateCatalog());
    console.log(`Sample catalog ready: ${catalog.books} Books, ${catalog.copies} Copies`);
  } else if (existsSync(source.path)) {
    // Loaded only here: the workbook reader is a development dependency, not part of the deployed API.
    const { seedLibraryCatalog } = await import("./library-catalog.ts");
    console.log(`Reading the library's catalog from ${source.path}`);
    await seedLibraryCatalog(db, source.path, (line) => console.log(line));
  } else if (source.given) {
    throw new Error(`No file at ${source.path}`);
  } else {
    console.log(
      `Catalog left as it is: the library's workbook is not at ${source.path}. ` +
        "Put it there, or run with --workbook <path>, or --sample-catalog for the generated sample catalog.",
    );
  }
} finally {
  await db.end();
}
