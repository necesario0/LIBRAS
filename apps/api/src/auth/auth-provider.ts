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
  /** Returns undefined when the email and password do not match an account. */
  signInWithPassword(email: string, password: string): Promise<SignedIn | undefined>;
  /** Swaps a refresh token for a new session. Returns undefined when the token is unknown, used or revoked. */
  refresh(refreshToken: string): Promise<SignedIn | undefined>;
  /** Returns who an access token belongs to, or undefined when it is invalid, expired or signed out. */
  identify(accessToken: string): Promise<Identity | undefined>;
  /** Ends the session the access token belongs to. Safe to call with a token that no longer works. */
  signOut(accessToken: string): Promise<void>;
}
