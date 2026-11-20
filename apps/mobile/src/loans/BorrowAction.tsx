import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { LIBRARY_HOURS_SUMMARY, canBorrow, goodStandingNotice, isInLibraryOnlyAccount } from "@libras/shared";
import type { AccountType, BookDetail, GoodStanding } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { CallToAction } from "../components/CallToAction";
import { colors, fontFamily, fontSize, lineHeightFor } from "../theme/tokens";
import { currentLoans, useLoans } from "./useLoans";

/**
 * The Borrow action of the Book page (Figma 609:1066). It appears when the
 * Book has an available Copy and the Member can borrow (including same-day
 * in-library borrowing for Visitors and Alumni within library hours). Borrow
 * records nothing: it closes the Book page and opens the Digital ID tab, and
 * the Loan exists only once the Librarian confirms it at the desk. A Member
 * at their loan limit, or not in Good standing (`goodStanding`, from the API;
 * undefined until it loads), is told so instead of being sent to the desk for
 * nothing.
 */
export function BorrowAction({
  book,
  accountType,
  goodStanding,
}: {
  book: BookDetail;
  accountType: AccountType;
  goodStanding: GoodStanding | undefined;
}) {
  const router = useRouter();
  const { request } = useAuth();
  const { state } = useLoans(request);

  if (!canBorrow(accountType) || book.availableCopies === 0) return null;

  if (goodStanding && !goodStanding.inGoodStanding) {
    return (
      <View style={styles.action} testID="borrow-not-in-good-standing">
        <Text style={styles.note}>{goodStandingNotice(goodStanding.reasons)}</Text>
      </View>
    );
  }

  const policy = state.status === "loaded" ? state : undefined;
  if (policy && policy.loanLimit <= 0) return null;

  const out = policy ? currentLoans(policy.loans).length : 0;
  if (policy && out >= policy.loanLimit) {
    return (
      <View style={styles.action} testID="borrow-at-limit">
        <Text style={styles.note}>
          {`You have ${out} of ${policy.loanLimit} Loans out, which is your limit. Return a Copy to borrow another.`}
        </Text>
      </View>
    );
  }

  const inLibraryOnly = policy?.inLibraryOnly ?? isInLibraryOnlyAccount(accountType);

  return (
    <View style={styles.action} testID="borrow-action">
      <Text style={styles.note}>
        {inLibraryOnly ? (
          <>
            {"Loan period: "}
            <Text style={styles.period}>In-library use only (return before closing)</Text>
            {`. Library hours: ${LIBRARY_HOURS_SUMMARY}. `}
          </>
        ) : policy && policy.loanPeriodDays !== null ? (
          <>
            {"Loan period: "}
            <Text style={styles.period}>{`${policy.loanPeriodDays} days.`}</Text>{" "}
          </>
        ) : null}
        After you tap Borrow, show the code to the librarian.
      </Text>
      <CallToAction label="Borrow" onPress={() => router.dismissTo("/digital-id")} testID="book-borrow" />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: 28 },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), letterSpacing: -0.28, color: colors.black },
  period: { color: colors.primary },
});
