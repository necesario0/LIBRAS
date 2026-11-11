export interface Config {
  port: number;
  databaseUrl: string;
  isProduction: boolean;
  /** The Supabase project URL. Supabase Auth lives under it at /auth/v1. */
  supabaseUrl: string;
  /** The Supabase publishable (anon) key: enough to sign people in, nothing more. */
  supabasePublishableKey: string;
}

/** What scripts and tests need to administer accounts. The running API never loads this. */
export interface SupabaseAdminConfig {
  supabaseUrl: string;
  /** The Supabase secret (service role) key. */
  supabaseSecretKey: string;
}

/** The PostgreSQL that `npm run db:start` runs. The password is the Supabase CLI's fixed local default. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The Supabase API gateway that `npm run db:start` runs. */
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";

function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Reads a Supabase key. There is no default: no key lives in the source. The
 * npm scripts fill SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from the
 * local stack (`apps/api/scripts/with-local-supabase.ts`), and production sets
 * them explicitly.
 */
function requiredKey(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value) return value;
  throw new Error(
    isProductionEnv(env)
      ? `${name} must be set in production`
      : `${name} is not set. Run through an npm script, which reads it from the local Supabase that \`npm run db:start\` starts, or set it yourself.`,
  );
}

/** Reads a variable that has a local default but must be set explicitly in production. */
function required(env: NodeJS.ProcessEnv, name: string, localDefault: string): string {
  const value = env[name] ?? (isProductionEnv(env) ? undefined : localDefault);
  if (!value) throw new Error(`${name} must be set in production`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a valid port: ${env.PORT}`);

  return {
    port,
    databaseUrl: required(env, "DATABASE_URL", LOCAL_DATABASE_URL),
    isProduction: isProductionEnv(env),
    supabaseUrl: required(env, "SUPABASE_URL", LOCAL_SUPABASE_URL),
    supabasePublishableKey: requiredKey(env, "SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function loadSupabaseAdminConfig(env: NodeJS.ProcessEnv = process.env): SupabaseAdminConfig {
  return {
    supabaseUrl: required(env, "SUPABASE_URL", LOCAL_SUPABASE_URL),
    supabaseSecretKey: requiredKey(env, "SUPABASE_SECRET_KEY"),
  };
}
