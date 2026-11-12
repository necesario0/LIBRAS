import { accountTypeSchema } from "@libras/shared";
import type { MemberProfile } from "@libras/shared";
import type { Identity } from "../auth/auth-provider.ts";
import { withIdentity } from "../auth/identity.ts";
import type { Database } from "../db.ts";

export interface MemberRow {
  user_id: string;
  account_type: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  username: string;
  contact_number: string | null;
  details: unknown;
}

export const MEMBER_COLUMNS =
  "user_id, account_type, first_name, middle_name, last_name, username, contact_number, details";

/** Turns a `public.members` row into what the app sees. */
export function memberFromRow(row: MemberRow, email: string): MemberProfile {
  const accountType = accountTypeSchema.parse(row.account_type);
  // `details` was validated for this Account Type when the sign-up was accepted, and a check constraint keeps its keys.
  return {
    id: row.user_id,
    email,
    accountType,
    firstName: row.first_name,
    ...(row.middle_name === null ? {} : { middleName: row.middle_name }),
    lastName: row.last_name,
    username: row.username,
    ...(row.contact_number === null ? {} : { contactNumber: row.contact_number }),
    details: row.details,
  } as MemberProfile;
}

/**
 * The Member profile of the signed-in person, or undefined when they are not a
 * Member (staff, for example). Read as that person, so row-level security lets
 * them see their own row and nothing else.
 */
export async function findMemberProfile(db: Database, identity: Identity): Promise<MemberProfile | undefined> {
  const row = await withIdentity(db, identity, async (scope) => {
    const result = await scope.query<MemberRow>(`select ${MEMBER_COLUMNS} from public.members where user_id = $1`, [
      identity.userId,
    ]);
    return result.rows[0];
  });
  return row ? memberFromRow(row, identity.email) : undefined;
}
