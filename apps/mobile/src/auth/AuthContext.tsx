import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MemberProfile, SignInRequest } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import { SessionManager } from "./SessionManager";
import type { AuthorizedRequest } from "./authorized-request";
import { secureSessionStore } from "./session-store";

/**
 * Where the app stands with the Member's session:
 * - `restoring`: the app just launched and is reading the stored session;
 * - `signedOut`: no session, or it could not be renewed;
 * - `signedIn`: a live session and the Member's profile;
 * - `unavailable`: there is a stored session but the server could not be reached to check it.
 */
export type AuthState =
  | { status: "restoring" }
  | { status: "signedOut" }
  | { status: "signedIn"; member: MemberProfile }
  | { status: "unavailable"; message: string };

interface AuthContextValue {
  state: AuthState;
  /** Signs in with email and password. Throws an `ApiError` the sign-in screen shows. */
  signIn(credentials: SignInRequest): Promise<void>;
  /** Signs out on this device and on the server. Protected screens close at once. */
  signOut(): Promise<void>;
  /** Checks the stored session again after the app could not reach the server. */
  retry(): void;
  /**
   * Runs an authorised API call: `request((accessToken) => api.getSomething(accessToken))`.
   * Renews the session once when the access token has expired and signs the
   * Member out if the session cannot be renewed. Every screen that needs the
   * signed-in API goes through this.
   */
  request: AuthorizedRequest;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Owns the Member's session for the whole app. Mount it once, above the navigator. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "restoring" });
  const manager = useRef<SessionManager | null>(null);
  manager.current ??= new SessionManager({
    store: secureSessionStore,
    api,
    onEnded: () => setState({ status: "signedOut" }),
  });
  const sessions = manager.current;

  const restore = useCallback(async () => {
    setState({ status: "restoring" });
    try {
      if (!(await sessions.restore())) {
        setState({ status: "signedOut" });
        return;
      }
      const { member } = await sessions.call((token) => api.getMe(token));
      setState({ status: "signedIn", member });
    } catch (error) {
      // A session the server refused has already been cleared and reported through onEnded.
      if (error instanceof ApiError && error.status === 401) setState({ status: "signedOut" });
      else setState({ status: "unavailable", message: messageOf(error) });
    }
  }, [sessions]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signIn(credentials) {
        const { session, member } = await api.signIn(credentials);
        await sessions.begin(session);
        setState({ status: "signedIn", member });
      },
      async signOut() {
        setState({ status: "signedOut" });
        await sessions.end();
      },
      retry: () => void restore(),
      request: (call) => sessions.call(call),
    }),
    [state, sessions, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** The session and what to do with it. Throws outside `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) throw new Error("useAuth needs AuthProvider above it");
  return value;
}

/** The signed-in Member. Only for screens inside `app/(app)`, which are reachable only when signed in. */
export function useMember(): MemberProfile {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("useMember was used on a screen that is not behind the sign-in guard");
  return state.member;
}
