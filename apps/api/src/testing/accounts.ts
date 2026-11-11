import { randomUUID } from "node:crypto";
import type { StaffRole } from "@libras/shared";
import { SupabaseAuthAdmin } from "../auth/supabase-auth-admin.ts";
import { loadSupabaseAdminConfig } from "../config.ts";
import type { Database } from "../db.ts";

export interface TestAccountOptions {
  /** Makes the account library staff. Leave it out for an account that is not staff. */
  staff?: { role: StaffRole; fullName: string };
}

export interface TestAccount {
  userId: string;
  email: string;
  password: string;
}

/**
 * Creates a real account in the local Supabase Auth, with a unique email so
 * tests never collide, and optionally a staff row. Sign in with it over HTTP.
 */
export async function createTestAccount(target: { db: Database }, options: TestAccountOptions = {}): Promise<TestAccount> {
  const { supabaseUrl, supabaseSecretKey } = loadSupabaseAdminConfig();
  const admin = new SupabaseAuthAdmin({ url: supabaseUrl, secretKey: supabaseSecretKey });

  const email = `test-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;
  const userId = await admin.createUser(email, password);
  if (userId === undefined) throw new Error(`The test account ${email} already exists`);

  if (options.staff) {
    await target.db.query("insert into public.staff (user_id, role, full_name) values ($1, $2, $3)", [
      userId,
      options.staff.role,
      options.staff.fullName,
    ]);
  }
  return { userId, email, password };
}
