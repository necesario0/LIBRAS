import { z } from "zod";

/**
 * What a client sends to sign in. A sign-in never explains which field was
 * wrong, so the only rule here is that both are present and of sane length.
 */
export const signInRequestSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const refreshSessionRequestSchema = z.object({
  refreshToken: z.string().min(1).max(1024),
});
export type RefreshSessionRequest = z.infer<typeof refreshSessionRequestSchema>;

/**
 * A signed-in session. The client sends `accessToken` as
 * `Authorization: Bearer <accessToken>` on every request, and swaps
 * `refreshToken` for a new session at `POST /auth/refresh` when the access
 * token has expired. A refresh token works once.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working, ISO 8601. */
  expiresAt: string;
}

/** Staff roles. Tier 1 has Librarians only. */
export type StaffRole = "librarian";

/** A staff member as the Librarian pages see them. Staff are not Members. */
export interface StaffProfile {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
}

/** The body of `POST /staff/sign-in`. */
export interface StaffSignInResponse {
  session: Session;
  staff: StaffProfile;
}

/** The body of `GET /staff/me`. */
export interface StaffMeResponse {
  staff: StaffProfile;
}

/** The body of `POST /auth/refresh`. */
export interface RefreshSessionResponse {
  session: Session;
}
