import { StyleSheet, Text, View } from "react-native";
import { formatLibraryDate } from "@libras/shared";
import type { Loan } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The status pill of a Loan: overdue stands out, a Loan in time is calm, a returned one is muted. */
function pillOf(loan: Loan): { label: string; surface: string; text: string } {
  if (loan.returnedAt !== null) return { label: "Returned", surface: colors.pill, text: colors.textMuted };
  if (loan.overdue) return { label: "Overdue", surface: colors.dangerSurface, text: colors.danger };
  return { label: "On loan", surface: colors.availableSurface, text: colors.availableText };
}

/**
 * One of the Member's Loans: the Book, the Copy, the day it was checked out and
 * the day it is due (or came back). An overdue Loan has a red pill and a red due date.
 */
export function LoanRow({ loan }: { loan: Loan }) {
  const pill = pillOf(loan);
  return (
    <View style={styles.row} testID={`loan-${loan.id}`}>
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
          <Text style={[styles.dates, styles.due, loan.overdue && styles.overdue]} testID="loan-due">
            {`${loan.overdue ? "Was due" : "Return by"} ${formatLibraryDate(loan.dueAt)}`}
          </Text>
        ) : (
          <Text style={styles.dates} testID="loan-returned">{`Returned on ${formatLibraryDate(loan.returnedAt)}`}</Text>
        )}
      </View>
      <View style={[styles.pill, { backgroundColor: pill.surface }]} testID="loan-status">
        <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  dates: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  due: { color: colors.primary },
  overdue: { fontFamily: fontFamily.semiBold, color: colors.danger },
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.micro },
});
