import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { myBooksAttention } from "@libras/shared";
import type { MyBooksAttention } from "@libras/shared";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { HoldsState } from "../holds/useHolds";
import type { LoansState } from "../loans/useLoans";
import { useFetch } from "../hooks/useFocusedFetch";

interface MyBooksValue {
  loans: LoansState;
  holds: HoldsState;
  /**
   * Whether the Member can borrow: their Loan Policy's loan limit is above
   * zero. Undefined until the Loans have loaded at least once.
   */
  canBorrow: boolean | undefined;
  /** Whether the Member's Loans are limited to same-day in-library use within library hours. */
  inLibraryOnly: boolean | undefined;
  /** Which segments need the Member now. The My Books tab shows a dot when either does. */
  attention: MyBooksAttention;
  /** Fetches the Loans and the Holds again. */
  reload: () => Promise<void>;
}

const MyBooksContext = createContext<MyBooksValue | undefined>(undefined);

/**
 * The Member's Loans and Holds for the tabs: one copy shared by the My Books
 * screen and the dot on its tab, so the two never disagree. The tabs layout
 * mounts it and calls `reload` whenever a tab comes into focus; it also
 * reloads when the app comes back to the foreground.
 */
export function MyBooksProvider({ children }: { children: ReactNode }) {
  const { request } = useAuth();
  const loans = useFetch(request, api.getLoans, "Your Loans could not be loaded. Please try again.");
  const holds = useFetch(request, api.getHolds, "Your Holds could not be loaded. Please try again.");
  const reloadLoans = loans.reload;
  const reloadHolds = holds.reload;

  const reload = useCallback(async () => {
    await Promise.all([reloadLoans(), reloadHolds()]);
  }, [reloadLoans, reloadHolds]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  const value = useMemo<MyBooksValue>(() => {
    // What has not loaded (yet) earns no dot.
    const attention = myBooksAttention({
      loans: loans.state.status === "loaded" ? loans.state.loans : [],
      holds: holds.state.status === "loaded" ? holds.state.holds : [],
      now: new Date(),
    });
    return {
      loans: loans.state,
      holds: holds.state,
      canBorrow: loans.state.status === "loaded" ? loans.state.loanLimit > 0 : undefined,
      inLibraryOnly: loans.state.status === "loaded" ? loans.state.inLibraryOnly : undefined,
      attention,
      reload,
    };
  }, [loans.state, holds.state, reload]);

  return <MyBooksContext.Provider value={value}>{children}</MyBooksContext.Provider>;
}

/** The Member's Loans and Holds as the tabs share them. Only inside the tabs layout. */
export function useMyBooks(): MyBooksValue {
  const value = useContext(MyBooksContext);
  if (value === undefined) throw new Error("useMyBooks needs MyBooksProvider above it (the tabs layout)");
  return value;
}
