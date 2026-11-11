import type { MemberSignInResponse } from "@libras/shared";
import type { AppDeps } from "../app.ts";
import { AppError } from "../errors.ts";
import { findMemberProfile } from "./profile.ts";

export function emailNotVerified(): AppError {
  return new AppError(
    403,
    "email_not_verified",
    "Your email is not verified yet. Enter the code we emailed you, or ask for a new one, to finish signing up.",
  );
}

/**
 * Signs a Member in with email and password. Throws 401 `invalid_credentials`
 * (one message for an unknown email and a wrong password), 403
 * `email_not_verified` (the password was right but the sign-up was never
 * finished) or 403 `not_member` (the password was right but the account is
 * staff, who sign in on the desk page: the session just made is ended again).
 *
 * This is the single way a Member session starts. Wrap it in the sign-in
 * limiter (the route does); later features that record sign-ins, such as the
 * audit log, hook in here.
 */
export async function signInMember(
  { auth, db }: Pick<AppDeps, "auth" | "db">,
  email: string,
  password: string,
): Promise<MemberSignInResponse> {
  const signedIn = await auth.signInWithPassword(email, password);
  if (signedIn === "unverified") throw emailNotVerified();
  // Same message for an unknown email and a wrong password: the response never says which was wrong.
  if (signedIn === undefined) throw new AppError(401, "invalid_credentials", "The email or password is incorrect.");

  const member = await findMemberProfile(db, signedIn.identity);
  if (!member) {
    await auth.signOut(signedIn.session.accessToken);
    throw new AppError(
      403,
      "not_member",
      "This account cannot be used in the app. The app is for library Members. Library staff sign in on the desk page.",
    );
  }
  return { session: signedIn.session, member };
}
