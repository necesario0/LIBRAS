import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RENEWAL_REASONS, formatLibraryDate, formatPesos } from "@libras/shared";
import type { Loan } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The status pill of a Loan: overdue stands out, a renewed Loan says so, a Loan in time is calm, a returned one is muted. */
function pillOf(loan: Loan): { label: string; surface: string; text: string } {
  if (loan.returnedAt !== null) return { label: "Returned", surface: colors.pill, text: colors.textMuted };
  if (loan.overdue) return { label: "Overdue", surface: colors.dangerSurface, text: colors.danger };
  if (loan.renewalCount > 0) return { label: "Renewed", surface: colors.selected, text: colors.primary };
  return { label: "On loan", surface: colors.availableSurface, text: colors.availableText };
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
      setFailure(error instanceof Error ? error.message : "Your Loan could not be renewed. Please try again.");
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
                {`${loan.overdue ? "Was due" : "Return by"} ${formatLibraryDate(loan.dueAt)}`}
              </Text>
              {/* Truthy, not `!== null`: an API from before Fines sends no `fine` at all. */}
              {loan.fine ? (
                <Text style={[styles.dates, styles.fine]} testID="loan-fine">
                  {`Fine so far: ${formatPesos(loan.fine.amountCentavos)} (${loan.fine.daysLate} ${loan.fine.daysLate === 1 ? "day" : "days"} late)`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.dates} testID="loan-returned">{`Returned on ${formatLibraryDate(loan.returnedAt)}`}</Text>
          )}
        </View>
        <View style={[styles.pill, { backgroundColor: pill.surface }]} testID="loan-status">
          <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
        </View>
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
        <View style={styles.confirm} testID="loan-renew-confirmation">
          <Text style={styles.confirmText} testID="loan-renew-question">
            {"Renew this Loan? The new due date is "}
            <Text style={styles.confirmDate}>{formatLibraryDate(renewal.dueAt)}</Text>
            {renewal.last ? ". After this, it cannot be renewed again." : "."}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void renew()}
              style={[styles.action, styles.actionPrimary, busy && styles.busy]}
              testID="loan-renew-confirm"
            >
              <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>{busy ? "Renewing..." : "Yes, renew"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setConfirming(false)}
              style={[styles.action, styles.actionMuted]}
              testID="loan-renew-keep"
            >
              <Text style={styles.actionLabel}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFailure(undefined);
            setConfirming(true);
          }}
          style={[styles.action, styles.actionMuted, styles.renew]}
          testID="loan-renew"
        >
          <Text style={styles.actionLabel}>Renew</Text>
        </Pressable>
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
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.micro },
  reason: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textMuted },
  failure: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.danger },
  confirm: { gap: spacing.sm },
  confirmText: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textSecondary },
  confirmDate: { fontFamily: fontFamily.semiBold, color: colors.black },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { height: 36, borderRadius: radii.button, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  renew: { alignSelf: "flex-start" },
  actionMuted: { backgroundColor: colors.surface },
  actionPrimary: { backgroundColor: colors.primary },
  actionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, color: colors.black },
  actionPrimaryLabel: { color: colors.white },
  busy: { opacity: 0.6 },
});
