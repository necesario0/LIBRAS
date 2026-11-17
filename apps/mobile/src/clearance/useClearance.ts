import type { ClearanceResponse } from "@libras/shared";
import { api } from "../api";
import type { AuthorizedRequest } from "../auth/authorized-request";
import { useFocusedFetch } from "../hooks/useFocusedFetch";
import type { FetchState } from "../hooks/useFocusedFetch";

/** What a screen shows of the Member's Clearance: when loaded, `clearance` as the API worked it out. */
export type ClearanceState = FetchState<ClearanceResponse>;

/**
 * The Member's Clearance, fetched when the screen comes into focus (so Profile
 * shows a Loan returned or a Fine settled while another screen was open) and
 * again on `reload`. The app holds no rule of its own: the API says who is
 * cleared and why not.
 */
export function useClearance(request: AuthorizedRequest) {
  return useFocusedFetch(request, api.getClearance, "Your Clearance could not be loaded. Please try again.");
}
