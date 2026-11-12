import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { isCurrentLoan } from "@libras/shared";
import type { Loan, MyLoansResponse } from "@libras/shared";
import { api } from "../api";
import { ApiError } from "../api/client";
import type { AuthorizedRequest } from "../catalog/useCatalogSearch";

/**
 * What a screen shows of the Member's Loans:
 * - `loading`: first fetch;
 * - `loaded`: the Loans, current ones first (the API's order), and the Member's Loan Policy;
 * - `error`: they could not be fetched. `message` is safe to show.
 */
export type LoansState =
  | { status: "loading" }
  | { status: "loaded"; loans: Loan[]; loanLimit: number; loanPeriodDays: number | null }
  | { status: "error"; message: string };

/** The Loans whose Copy is still out. */
export function currentLoans(loans: readonly Loan[]): Loan[] {
  return loans.filter(isCurrentLoan);
}

function failureMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Your Loans could not be loaded. Please try again.";
}

/**
 * The Member's Loans. They are fetched when the screen comes into focus (so
 * Home shows a Loan confirmed while another screen was open) and again on
 * `reload`. A failed refresh keeps the Loans already shown.
 */
export function useLoans(request: AuthorizedRequest) {
  const [state, setState] = useState<LoansState>({ status: "loading" });
  const requestRef = useRef(request);
  requestRef.current = request;
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const body = await requestRef.current((token) => api.getLoans(token));
      if (id === latest.current) setState({ status: "loaded", ...body });
    } catch (error) {
      if (id !== latest.current) return;
      const message = failureMessage(error);
      setState((current) => (current.status === "loaded" ? current : { status: "error", message }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
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
