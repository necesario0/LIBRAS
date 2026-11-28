import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LIBRARY_HOURS_SUMMARY, canBorrow, isInLibraryOnlyAccount } from "@libras/shared";
import type { AccountType, BookDetail, GoodStanding } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { CallToAction } from "../components/CallToAction";
import { StandingNotice } from "../standing/StandingNotice";
import { colors, fontFamily, fontSize, lineHeightFor } from "../theme/tokens";
import { BorrowSheet } from "./BorrowSheet";
import { currentLoans, useLoans } from "./useLoans";

/**
 * The Borrow action of the Book page (Figma 609:1066). It appears when the
 * Book has an available Copy and the Member can borrow (including same-day
 * in-library borrowing for Visitors and Alumni within library hours). "Borrow
 * at the desk" records nothing: it opens the Borrow sheet over the Book
 * (`BorrowSheet`), with the shelf to take it from and the Digital ID to show,
 * and the Loan exists only once the Librarian confirms it at the desk. A
 * Member at their loan limit, or not in Good standing (`goodStanding`, from
 * the API; undefined until it loads), is told so instead of being sent to the
 * desk for nothing: the second with the red `StandingNotice`.
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
  const { request } = useAuth();
  const { state } = useLoans(request);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!canBorrow(accountType) || book.availableCopies === 0) return null;

  if (goodStanding && !goodStanding.inGoodStanding) {
    return <StandingNotice title="You can’t borrow this yet" reasons={goodStanding.reasons} from="pushed" testID="borrow-not-in-good-standing" />;
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
  const loanPeriodDays = policy?.loanPeriodDays ?? null;
  const due = inLibraryOnly
    ? "Use it in the library and return it before closing."
    : loanPeriodDays === null
      ? ""
      : `It is due back in ${loanPeriodDays} days.`;

  return (
    <View style={styles.action} testID="borrow-action">
      <Text style={styles.note}>
        {inLibraryOnly ? (
          <>
            {"Loan period: "}
            <Text style={styles.period}>In-library use only (return before closing)</Text>
            {`. Library hours: ${LIBRARY_HOURS_SUMMARY}. `}
          </>
        ) : loanPeriodDays !== null ? (
          <>
            {"Loan period: "}
            <Text style={styles.period}>{`${loanPeriodDays} days.`}</Text>{" "}
          </>
        ) : null}
        Take it from the shelf, then show your Digital ID at the desk.
      </Text>
      <CallToAction label="Borrow at the desk" onPress={() => setSheetOpen(true)} testID="book-borrow" />
      <BorrowSheet book={book} due={due} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: 28 },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), letterSpacing: -0.28, color: colors.black },
  // Weight, not the link blue of the frames: nothing here can be tapped.
  period: { fontFamily: fontFamily.semiBold },
});
