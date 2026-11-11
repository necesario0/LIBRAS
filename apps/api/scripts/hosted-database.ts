// Helpers for the commands that act on the hosted (Supabase) database.
// Errors never contain the connection string, because it holds the password.

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);

export interface HostedTarget {
  /** The connection string without the password: safe to put on a command line. */
  urlWithoutPassword: string;
  /** Pass it to the child process as PGPASSWORD. */
  password: string;
  host: string;
  port: string;
  database: string;
  user: string;
}

/** Reads and checks the hosted DATABASE_URL (a Supabase session pooler string). */
export function parseHostedDatabaseUrl(raw: string | undefined): HostedTarget {
  if (!raw) {
    throw new Error("DATABASE_URL is not set. Run `npm run setup:hosted` first: it writes it to .env.hosted.");
  }
  if (raw.includes("[YOUR-PASSWORD]")) {
    throw new Error("DATABASE_URL still holds the [YOUR-PASSWORD] placeholder. Put the database password in its place.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string (expected postgresql://user:password@host:port/database)");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must be a postgresql:// connection string");
  }
  if (LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("DATABASE_URL points at a local database. The hosted commands only act on the hosted Supabase database.");
  }
  if (!url.password) {
    throw new Error("DATABASE_URL has no password. Use the Supabase session pooler string with the database password filled in.");
  }

  const password = decodeURIComponent(url.password);
  url.password = "";
  return {
    urlWithoutPassword: url.toString(),
    password,
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username),
  };
}

/** `user@host:port/database`, for telling the developer what is about to be changed. */
export function describeTarget(target: HostedTarget): string {
  return `${target.user}@${target.host}:${target.port}/${target.database}`;
}
