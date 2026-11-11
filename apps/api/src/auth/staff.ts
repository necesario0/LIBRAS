import type { StaffProfile, StaffRole } from "@libras/shared";
import type { Database } from "../db.ts";
import type { Identity } from "./auth-provider.ts";
import { withIdentity } from "./identity.ts";

interface StaffRow {
  role: StaffRole;
  full_name: string;
}

/**
 * The staff profile of the signed-in person, or undefined when they are not
 * staff (a Member, for example). Read as that person, so row-level security
 * lets them see their own staff row and nothing else.
 */
export async function findStaffProfile(db: Database, identity: Identity): Promise<StaffProfile | undefined> {
  const row = await withIdentity(db, identity, async (scope) => {
    const result = await scope.query<StaffRow>("select role, full_name from public.staff where user_id = $1", [
      identity.userId,
    ]);
    return result.rows[0];
  });
  if (!row) return undefined;
  return { id: identity.userId, email: identity.email, fullName: row.full_name, role: row.role };
}
