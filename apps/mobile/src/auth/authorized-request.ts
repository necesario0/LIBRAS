/**
 * Runs a call with the Member's access token, renewing the session when needed:
 * `request((accessToken) => api.getSomething(accessToken))`. It is
 * `useAuth().request`; hooks take it as a parameter so they need no context.
 */
export type AuthorizedRequest = <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
