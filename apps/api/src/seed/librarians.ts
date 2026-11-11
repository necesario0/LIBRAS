import { SupabaseAuthAdmin } from "../auth/supabase-auth-admin.ts";
import { loadSupabaseAdminConfig } from "../config.ts";
import type { Database } from "../db.ts";

export interface LibrarianSeed {
  email: string;
  password: string;
  fullName: string;
}

/**
 * Creates the Librarian accounts, or brings existing ones back to this
 * definition (password and name). Safe to run any number of times.
 * Librarians are staff, never Members: they get a `public.staff` row and
 * nothing else.
 */
export async function seedLibrarians(db: Database, librarians: readonly LibrarianSeed[]): Promise<void> {
  const { supabaseUrl, supabaseSecretKey } = loadSupabaseAdminConfig();
  const admin = new SupabaseAuthAdmin({ url: supabaseUrl, secretKey: supabaseSecretKey });

  for (const { email, password, fullName } of librarians) {
    let userId = await admin.createUser(email, password);
    if (userId === undefined) {
      const found = await db.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [email]);
      const existing = found.rows[0];
      if (!existing) throw new Error(`Supabase Auth says ${email} exists but auth.users has no such row`);
      userId = existing.id;
      await admin.setPassword(userId, password);
    }
    await db.query(
      `insert into public.staff (user_id, role, full_name) values ($1, 'librarian', $2)
       on conflict (user_id) do update set full_name = excluded.full_name`,
      [userId, fullName],
    );
  }
}
