import { useEffect, useRef } from "react";
import { isCurrentLoan } from "@libras/shared";
import type { Loan, MyLoansResponse } from "@libras/shared";
import { api } from "../api";
import type { AuthorizedRequest } from "../auth/authorized-request";
import { useFocusedFetch } from "../hooks/useFocusedFetch";
import type { FetchState } from "../hooks/useFocusedFetch";

/** What a screen shows of the Member's Loans: when loaded, the Loans, current ones first (the API's order), and the Member's Loan Policy. */
export type LoansState = FetchState<MyLoansResponse>;

/** The Loans whose Copy is still out. */
export function currentLoans(loans: readonly Loan[]): Loan[] {
  return loans.filter(isCurrentLoan);
}

/**
 * The Member's Loans. They are fetched when the screen comes into focus (so
 * Home shows a Loan confirmed while another screen was open) and again on
 * `reload`. A failed refresh keeps the Loans already shown.
 */
export function useLoans(request: AuthorizedRequest) {
  return useFocusedFetch(request, api.getLoans, "Your Loans could not be loaded. Please try again.");
}

/** How often the Digital ID screen asks whether the Librarian has confirmed a Loan. */
const WATCH_INTERVAL_MS = 2_500;

/**
 * Watches for a Loan that the Librarian confirms while the screen is open and
 * calls `onLoan` with it, once. The app cannot create a Loan: it learns of one
 * from the API. The Loans the Member already had when the screen opened are
 * the baseline; the first current Loan that is not among them is the new one.
 * A failed request is simply tried again at the next turn.
 */
export function useNewLoan(request: AuthorizedRequest, onLoan: (loan: Loan) => void): void {
  const requestRef = useRef(request);
  const onLoanRef = useRef(onLoan);
  useEffect(() => {
    requestRef.current = request;
    onLoanRef.current = onLoan;
  });

  useEffect(() => {
    let stopped = false;
    let known: Set<string> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const look = async () => {
      let body: MyLoansResponse | undefined;
      try {
        body = await requestRef.current((token) => api.getLoans(token));
      } catch {
        body = undefined;
      }
      if (stopped) return;
      if (body !== undefined) {
        if (known === undefined) {
          known = new Set(body.loans.map((loan) => loan.id));
        } else {
          const seen = known;
          const fresh = currentLoans(body.loans).find((loan) => !seen.has(loan.id));
          if (fresh !== undefined) {
            stopped = true;
            onLoanRef.current(fresh);
            return;
          }
        }
      }
      timer = setTimeout(() => void look(), WATCH_INTERVAL_MS);
    };
    void look();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
}
