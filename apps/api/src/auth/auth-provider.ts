import type { Session } from "@libras/shared";

/** Who is making a request, as proven by their session. Says nothing about what they may do. */
export interface Identity {
  /** The account id: `auth.users.id`, and `auth.uid()` inside PostgreSQL. */
  userId: string;
  email: string;
}

export interface SignedIn {
  identity: Identity;
  session: Session;
}

/**
 * Where accounts, passwords and sessions live. The API never stores a password
 * or issues a token itself: Supabase Auth does (ADR 0003).
 */
export interface AuthProvider {
  /**
   * Returns undefined when the email and password do not match an account, and
   * "unverified" when they do but the email was never verified (so the person
   * cannot sign in yet). The second answer is only ever given for a correct password.
   */
  signInWithPassword(email: string, password: string): Promise<SignedIn | "unverified" | undefined>;
  /** Swaps a refresh token for a new session. Returns undefined when the token is unknown, used or revoked. */
  refresh(refreshToken: string): Promise<SignedIn | undefined>;
  /** Returns who an access token belongs to, or undefined when it is invalid, expired or signed out. */
  identify(accessToken: string): Promise<Identity | undefined>;
  /** Ends the session the access token belongs to. Safe to call with a token that no longer works. */
  signOut(accessToken: string): Promise<void>;
  /**
   * Ends EVERY session of the account the access token belongs to (access and
   * refresh tokens), this one included: "Sign out of all devices". Safe to call
   * with a token that no longer works. `account-settings.test.ts` proves it
   * against the real Supabase Auth.
   */
  signOutEverywhere(accessToken: string): Promise<void>;
  /**
   * Sets a new password for the account the access token belongs to. Supabase
   * Auth ends every OTHER session of the account (access and refresh tokens)
   * and keeps the one the token belongs to: Change password relies on it
   * (`password-change.test.ts` proves it against the real Supabase Auth). The
   * current password is NOT checked here: the caller does that first.
   * Returns false when the token no longer works.
   */
  changePassword(accessToken: string, newPassword: string): Promise<boolean>;
}

/**
 * Creating and confirming accounts. Needs Supabase's secret key, so it is the
 * one part of the API that holds it. Only the sign-up and Forgot password flows use it.
 */
export interface AccountAdmin {
  /**
   * Creates an account whose email is not confirmed yet, so it cannot sign in.
   * Returns its id, or undefined when the email already has an account.
   */
  createUnverifiedAccount(email: string, password: string): Promise<string | undefined>;
  /**
   * Replaces the account's password. Supabase Auth also ends every session of
   * the account (access and refresh tokens), which Forgot password relies on
   * (`password-reset.test.ts` proves it against the real Supabase Auth).
   */
  setPassword(userId: string, password: string): Promise<void>;
  /** Marks the email as confirmed: from now on the person can sign in. */
  confirmEmail(userId: string): Promise<void>;
}
