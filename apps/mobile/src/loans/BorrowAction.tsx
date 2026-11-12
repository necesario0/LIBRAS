import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { canBorrow } from "@libras/shared";
import type { AccountType, BookDetail } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { CallToAction } from "../components/CallToAction";
import { colors, fontFamily, fontSize } from "../theme/tokens";
import { currentLoans, useLoans } from "./useLoans";

/**
 * The Borrow action of the Book page (Figma 609:1066). It appears for a Member
 * who can borrow when the Book has an available Copy. Borrow records nothing:
 * it opens the Digital ID, and the Loan exists only once the Librarian confirms
 * it at the desk. A Member at their loan limit is told so instead of being
 * sent to the desk for nothing.
 */
export function BorrowAction({ book, accountType }: { book: BookDetail; accountType: AccountType }) {
  const router = useRouter();
  const { request } = useAuth();
  const { state } = useLoans(request);

  if (!canBorrow(accountType) || book.availableCopies === 0) return null;

  const policy = state.status === "loaded" ? state : undefined;
  const out = policy ? currentLoans(policy.loans).length : 0;
  if (policy && policy.loanLimit > 0 && out >= policy.loanLimit) {
    return (
      <View style={styles.action} testID="borrow-at-limit">
        <Text style={styles.note}>
          {`You have ${out} of ${policy.loanLimit} Loans out, which is your limit. Return a Copy to borrow another.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.action} testID="borrow-action">
      <Text style={styles.note}>
        {policy && policy.loanPeriodDays !== null ? (
          <>
            {"Loan period: "}
            <Text style={styles.period}>{`${policy.loanPeriodDays} days.`}</Text>{" "}
          </>
        ) : null}
        After you tap Borrow, show the code to the librarian.
      </Text>
      <CallToAction label="Borrow" onPress={() => router.push("/digital-id")} testID="book-borrow" />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: 28 },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.label, letterSpacing: -0.28, color: colors.black },
  period: { color: colors.primary },
});
