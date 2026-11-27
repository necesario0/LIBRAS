import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RENEWAL_REASONS, counted, formatLibraryDate, formatLoanDueAt, formatPesos } from "@libras/shared";
import type { Loan } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { RowAction, RowActions, RowConfirmation, RowConfirmationEmphasis } from "../components/RowConfirmation";
import { StatusPill } from "../components/StatusPill";
import type { PillTone } from "../components/StatusPill";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The status pill of a Loan: overdue stands out, a renewed Loan says so, a Loan in time is calm, a returned one is muted. */
function pillOf(loan: Loan): { label: string; tone: PillTone } {
  if (loan.returnedAt !== null) return { label: "Returned", tone: "neutral" };
  if (loan.overdue) return { label: "Overdue", tone: "danger" };
  if (loan.renewalCount > 0) return { label: "Renewed", tone: "info" };
  return { label: "Borrowed", tone: "available" };
}

interface LoanRowProps {
  loan: Loan;
  /** Renews the Loan. Rejects with a message safe to show. */
  onRenew: (loan: Loan) => Promise<void>;
}

/**
 * One of the Member's Loans: the Book, the Copy, the day it was checked out and
 * the day it is due (or came back). An overdue Loan has a red pill, a red due
 * date and the Fine so far, as the API worked it out; a renewed one a "Renewed"
 * pill. A current Loan that the API says can be
 * renewed has a Renew button that asks once more, with the due date the Renewal
 * gives; one that cannot be renewed says why in its place. The app holds no
 * Renewal rules: it shows what the Loans list says.
 */
export function LoanRow({ loan, onRenew }: LoanRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const pill = pillOf(loan);
  const renewal = loan.renewal;

  const renew = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      await onRenew(loan);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "This Book could not be renewed. Please try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <View style={styles.row} testID={`loan-${loan.id}`}>
      <View style={styles.main}>
        <BookCover id={loan.bookId} width={36} height={52} radius={radii.coverSmall} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2} testID="loan-title">
            {loan.bookTitle}
          </Text>
          <Text style={styles.authors} numberOfLines={1}>
            {loan.bookAuthors.length > 0 ? loan.bookAuthors.join("; ") : "Unknown author"}
          </Text>
          <Text style={styles.dates} testID="loan-checked-out">{`Borrowed on ${formatLibraryDate(loan.checkedOutAt)}`}</Text>
          {loan.returnedAt === null ? (
            <>
              <Text style={[styles.dates, styles.due, loan.overdue && styles.overdue]} testID="loan-due">
                {`${loan.overdue ? "Was due" : "Return by"} ${formatLoanDueAt(loan.dueAt)}`}
              </Text>
              {loan.fine !== null ? (
                <Text style={[styles.dates, styles.fine]} testID="loan-fine">
                  {`Fine so far: ${formatPesos(loan.fine.amountCentavos)} (${counted(loan.fine.daysLate, "day")} late)`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.dates} testID="loan-returned">{`Returned on ${formatLibraryDate(loan.returnedAt)}`}</Text>
          )}
        </View>
        <StatusPill label={pill.label} tone={pill.tone} testID="loan-status" />
      </View>

      {failure === undefined ? null : (
        <Text style={styles.failure} accessibilityRole="alert" testID="loan-renew-error">
          {failure}
        </Text>
      )}

      {renewal === null ? null : !renewal.renewable ? (
        <Text style={styles.reason} testID="loan-renew-reason">
          {RENEWAL_REASONS[renewal.reason]}
        </Text>
      ) : confirming ? (
        <RowConfirmation
          question={
            <>
              {"Renew this Book? The new due date is "}
              <RowConfirmationEmphasis>{formatLibraryDate(renewal.dueAt)}</RowConfirmationEmphasis>
              {renewal.last ? ". After this, it cannot be renewed again." : "."}
            </>
          }
          confirm={{ label: "Yes, renew", busyLabel: "Renewing...", tone: "primary", testID: "loan-renew-confirm" }}
          keep={{ label: "Not now", testID: "loan-renew-keep" }}
          busy={busy}
          onConfirm={() => void renew()}
          onKeep={() => setConfirming(false)}
          testID="loan-renew-confirmation"
          questionTestID="loan-renew-question"
        />
      ) : (
        <RowActions>
          <RowAction
            label="Renew"
            onPress={() => {
              setFailure(undefined);
              setConfirming(true);
            }}
            testID="loan-renew"
          />
        </RowActions>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surface },
  main: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  dates: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  due: { color: colors.primary },
  overdue: { fontFamily: fontFamily.semiBold, color: colors.danger },
  fine: { fontFamily: fontFamily.medium, color: colors.danger },
  reason: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textMuted },
  failure: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.danger },
});
