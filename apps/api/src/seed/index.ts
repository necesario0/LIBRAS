// The seed script: `npm run seed`. Later tickets add the Loan Policy and
// the settings here. Safe to run again.
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import { seedCatalog } from "./catalog.ts";
import { generateCatalog } from "./catalog-generator.ts";
import { seedLibrarians } from "./librarians.ts";
import type { LibrarianSeed } from "./librarians.ts";

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

const config = loadConfig();
const db = createDatabase(config.databaseUrl, console, config.databaseCaCertificate);
try {
  const librarian = librarianFromEnvironment(process.env, config.isProduction);
  await seedLibrarians(db, [librarian]);
  console.log(`Librarian ready: ${librarian.email}`);
  const catalog = await seedCatalog(db, generateCatalog());
  console.log(`Catalog ready: ${catalog.books} Books, ${catalog.copies} Copies`);
} finally {
  await db.end();
}
