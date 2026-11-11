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
}

/**
 * Creating and confirming accounts. Needs Supabase's secret key, so it is the
 * one part of the API that holds it. Only the sign-up flow uses it.
 */
export interface AccountAdmin {
  /**
   * Creates an account whose email is not confirmed yet, so it cannot sign in.
   * Returns its id, or undefined when the email already has an account.
   */
  createUnverifiedAccount(email: string, password: string): Promise<string | undefined>;
  setPassword(userId: string, password: string): Promise<void>;
  /** Marks the email as confirmed: from now on the person can sign in. */
  confirmEmail(userId: string): Promise<void>;
}
