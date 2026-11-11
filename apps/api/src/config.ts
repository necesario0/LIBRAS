export interface Config {
  port: number;
  databaseUrl: string;
  /** Optional PEM CA certificate of the hosted database. When set, its TLS certificate is verified. */
  databaseCaCertificate: string | undefined;
  isProduction: boolean;
  /** The Supabase project URL. Supabase Auth lives under it at /auth/v1. */
  supabaseUrl: string;
  /** The Supabase publishable (anon) key: enough to sign people in, nothing more. */
  supabasePublishableKey: string;
  /** Web pages (exact origins) that may call the API from a browser. Empty: none. */
  corsAllowedOrigins: string[];
  /** The email service. Required in production; elsewhere unset means emails are printed to the console. */
  email: EmailConfig | undefined;
}

/** Brevo: transactional email over HTTPS (the README says why). */
export interface EmailConfig {
  apiKey: string;
  /** A sender address verified in Brevo. */
  fromAddress: string;
  fromName: string;
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

/** Parses CORS_ALLOWED_ORIGINS: a comma separated list of exact origins such as https://desk.example.com. */
function corsOrigins(env: NodeJS.ProcessEnv): string[] {
  const origins: string[] = [];
  for (const entry of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const raw = entry.trim().replace(/\/+$/, "");
    if (!raw) continue;
    let origin: string | undefined;
    try {
      const url = new URL(raw);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === raw) origin = url.origin;
    } catch {
      // Not a URL: reported below.
    }
    if (!origin) {
      throw new Error(`CORS_ALLOWED_ORIGINS must list exact origins such as https://desk.example.com, not "${raw}"`);
    }
    origins.push(origin);
  }
  return origins;
}

/** Brevo settings. Both are needed together, and production cannot start without them. */
function emailConfig(env: NodeJS.ProcessEnv): EmailConfig | undefined {
  const apiKey = env.BREVO_API_KEY;
  const fromAddress = env.EMAIL_FROM_ADDRESS;
  if (!apiKey && !fromAddress && !isProductionEnv(env)) return undefined;
  if (!apiKey) throw new Error("BREVO_API_KEY must be set together with EMAIL_FROM_ADDRESS");
  if (!fromAddress) throw new Error("EMAIL_FROM_ADDRESS must be set together with BREVO_API_KEY");
  return { apiKey, fromAddress, fromName: env.EMAIL_FROM_NAME || "LIBRAS" };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a valid port: ${env.PORT}`);

  return {
    port,
    databaseUrl: required(env, "DATABASE_URL", LOCAL_DATABASE_URL),
    databaseCaCertificate: env.DATABASE_CA_CERT || undefined,
    isProduction: isProductionEnv(env),
    supabaseUrl: required(env, "SUPABASE_URL", LOCAL_SUPABASE_URL),
    supabasePublishableKey: requiredKey(env, "SUPABASE_PUBLISHABLE_KEY"),
    corsAllowedOrigins: corsOrigins(env),
    email: emailConfig(env),
  };
}

export function loadSupabaseAdminConfig(env: NodeJS.ProcessEnv = process.env): SupabaseAdminConfig {
  return {
    supabaseUrl: required(env, "SUPABASE_URL", LOCAL_SUPABASE_URL),
    supabaseSecretKey: requiredKey(env, "SUPABASE_SECRET_KEY"),
  };
}
