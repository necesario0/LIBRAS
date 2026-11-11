import { isRecord } from "./supabase-auth.ts";

export interface SupabaseAuthAdminOptions {
  url: string;
  /** The secret (service role) key. It can create and change any account: scripts and tests only, never the running API. */
  secretKey: string;
}

/** Account administration in Supabase Auth, for the seed script and for tests. */
export class SupabaseAuthAdmin {
  readonly #adminUrl: string;
  readonly #secretKey: string;

  constructor(options: SupabaseAuthAdminOptions) {
    this.#adminUrl = `${options.url.replace(/\/+$/, "")}/auth/v1/admin`;
    this.#secretKey = options.secretKey;
  }

  /** Creates an account with a verified email. Returns its id, or undefined when the email already has an account. */
  async createUser(email: string, password: string): Promise<string | undefined> {
    const response = await this.#request("POST", "/users", { email, password, email_confirm: true });
    const body: unknown = await response.json().catch(() => undefined);
    if (response.ok && isRecord(body) && typeof body.id === "string") return body.id;
    if (isRecord(body) && body.error_code === "email_exists") return undefined;
    throw new Error(`Supabase Auth could not create the account: ${response.status} ${JSON.stringify(body)}`);
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const response = await this.#request("PUT", `/users/${encodeURIComponent(userId)}`, { password });
    if (!response.ok) throw new Error(`Supabase Auth could not set the password: ${response.status}`);
  }

  #request(method: "POST" | "PUT", path: string, body: unknown): Promise<Response> {
    return fetch(`${this.#adminUrl}${path}`, {
      method,
      headers: {
        apikey: this.#secretKey,
        authorization: `Bearer ${this.#secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }
}
