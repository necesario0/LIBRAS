import * as SecureStore from "expo-secure-store";
import type { Session } from "@libras/shared";

/** Where the signed-in session is kept between launches. */
export interface SessionStore {
  read(): Promise<Session | undefined>;
  write(session: Session): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "libras.session";

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string" &&
    typeof candidate.expiresAt === "string"
  );
}

/**
 * The session in the device's secure storage (Android Keystore backed). Not
 * AsyncStorage: the refresh token is as good as a password until it is used.
 * A value that cannot be read or does not look like a session counts as
 * signed out, so a corrupt entry never traps the app on a failing launch.
 */
export const secureSessionStore: SessionStore = {
  async read() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return isSession(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  },
  write: (session) => SecureStore.setItemAsync(KEY, JSON.stringify(session)),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
