export interface Config {
  port: number;
  databaseUrl: string;
  isProduction: boolean;
}

/** The PostgreSQL that `npm run db:start` runs. The password is the Supabase CLI's fixed local default. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === "production";

  const databaseUrl = env.DATABASE_URL ?? (isProduction ? undefined : LOCAL_DATABASE_URL);
  if (!databaseUrl) throw new Error("DATABASE_URL must be set in production");

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a valid port: ${env.PORT}`);

  return { port, databaseUrl, isProduction };
}
