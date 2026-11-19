import type { MemberProfile } from "@libras/shared";
import type { AppDeps } from "../app.ts";

/**
 * Whether `password` is the signed-in Member's current password, asked of
 * Supabase Auth by signing in with it. That makes a session of its own, which
 * is ended again at once. Change password and Delete my account call it behind
 * the sign-in limiter, and record a wrong password in the audit log themselves.
 */
export async function isCurrentPassword(deps: Pick<AppDeps, "auth">, member: MemberProfile, password: string): Promise<boolean> {
  const signedIn = await deps.auth.signInWithPassword(member.email, password);
  if (signedIn === undefined) return false;
  if (signedIn === "unverified") throw new Error("A signed-in Member's email is not verified");
  await deps.auth.signOut(signedIn.session.accessToken);
  return true;
}
