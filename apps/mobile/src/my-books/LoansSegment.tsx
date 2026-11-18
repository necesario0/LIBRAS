import { ActivityIndicator, Text, View } from "react-native";
import { isCurrentLoan } from "@libras/shared";
import type { Loan } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { LoanRow } from "../loans/LoanRow";
import { loanFailureMessage, renewLoan } from "../loans/useLoans";
import type { LoansState } from "../loans/useLoans";
import { colors, radii } from "../theme/tokens";
import { panelStyles as styles } from "./panelStyles";

/**
 * The Loans segment of My Books (the Tier 2 My Loans screen): the Copies the
 * Member has out, each with the day it was checked out and the day it is due,
 * overdue ones marked, and under them their past Loans, each with the day it
 * came back. A current Loan can be renewed from its row, or says why it cannot.
 */
export function LoansSegment({ state, reload }: { state: LoansState; reload: () => Promise<void> }) {
  const { request } = useAuth();

  const renew = async (loan: Loan) => {
    try {
      await renewLoan(request, loan.id);
    } catch (error) {
      // The Loan may have changed since the list was loaded: show the refusal, then the fresh reason in the row.
      void reload();
      throw new Error(loanFailureMessage(error, "Your Loan could not be renewed. Please try again."), { cause: error });
    }
    await reload();
  };

  const current = state.status === "loaded" ? state.loans.filter(isCurrentLoan) : [];
  const past = state.status === "loaded" ? state.loans.filter((loan) => !isCurrentLoan(loan)) : [];
  const overdue = current.filter((loan) => loan.overdue).length;

  return (
    <View style={styles.segment} testID="loans-segment">
      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="loans-loading" /> : null}

      {state.status === "error" ? (
        <View style={[styles.panel, styles.failed]} testID="loans-error">
          <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
            Your Loans did not load
          </Text>
          <Text style={styles.panelBody}>{state.message}</Text>
          <Button label="Try again" radius={radii.formButton} onPress={() => void reload()} testID="loans-retry" />
        </View>
      ) : null}

      {state.status === "loaded" && state.loans.length === 0 ? (
        <View style={styles.panel} testID="loans-empty">
          <Text style={styles.panelTitle} accessibilityRole="header">
            No Loans yet
          </Text>
          <Text style={styles.panelBody}>
            Open a Book with an available Copy and tap Borrow, then show your Digital ID to the librarian. The Copies you take home are listed
            here.
          </Text>
        </View>
      ) : null}

      {overdue > 0 ? (
        <View style={[styles.panel, styles.failed]} testID="loans-overdue-notice">
          <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
            {overdue === 1 ? "1 Loan is overdue" : `${overdue} Loans are overdue`}
          </Text>
          <Text style={styles.notice}>{`Please return ${overdue === 1 ? "it" : "them"} to the library desk as soon as you can.`}</Text>
        </View>
      ) : null}

      {current.length > 0 ? (
        <View testID="loans-current">
          <Text style={styles.section} testID="loans-current-count">
            {state.status === "loaded" && state.loanLimit > 0 ? `Current - ${current.length} of ${state.loanLimit}` : "Current"}
          </Text>
          {current.map((loan) => (
            <LoanRow key={loan.id} loan={loan} onRenew={renew} />
          ))}
        </View>
      ) : null}

      {current.length === 0 && past.length > 0 ? (
        <View style={styles.panel} testID="loans-none-current">
          <Text style={styles.panelTitle} accessibilityRole="header">
            No current Loans
          </Text>
          <Text style={styles.notice}>Nothing is out on your account right now. The Copies you have returned are listed below.</Text>
        </View>
      ) : null}

      {past.length > 0 ? (
        <View testID="loans-past">
          <Text style={styles.section} testID="loans-past-count">{`Past Loans - ${past.length}`}</Text>
          {past.map((loan) => (
            <LoanRow key={loan.id} loan={loan} onRenew={renew} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
