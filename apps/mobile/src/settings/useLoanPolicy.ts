import type { MemberLoanPolicyResponse } from "@libras/shared";
import { api } from "../api";
import type { AuthorizedRequest } from "../auth/authorized-request";
import { useFocusedFetch } from "../hooks/useFocusedFetch";
import type { FetchState } from "../hooks/useFocusedFetch";

/** The Member's own Loan Policy, from the API. The wording lives in `loanPolicyHelp` (shared). */
export type LoanPolicyState = FetchState<MemberLoanPolicyResponse>;

export function useLoanPolicy(request: AuthorizedRequest) {
  return useFocusedFetch<MemberLoanPolicyResponse>(request, api.getLoanPolicy, "Your Loan Policy could not be loaded. Please try again.");
}
