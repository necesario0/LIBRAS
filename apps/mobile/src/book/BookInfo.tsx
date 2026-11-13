import { StyleSheet, Text, View } from "react-native";
import { ACCOUNT_TYPE_LABELS, canBorrow } from "@libras/shared";
import type { AccountType, BookDetail } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The pill under the author: whether a Copy can be borrowed now. */
export function availabilityPill(book: Pick<BookDetail, "availableCopies" | "totalCopies">): string {
  if (book.totalCopies === 0) return "No copies";
  return book.availableCopies === 0 ? "None available" : "Available";
}

/** "1 copy" or "3 copies". */
function copiesLabel(count: number): string {
  return count === 1 ? "1 copy" : `${count} copies`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * The body of the Book sheet (Figma 609:1066): call number, cover, title,
 * authors, availability pill, the figures, details, and the note for an Account
 * Type that cannot borrow. The Figma genre tag, page count and description have
 * no field in the catalog yet, so they are not shown; the edition takes the
 * genre tag's place and the number of Copies the page count's.
 */
export function BookInfo({ book, accountType }: { book: BookDetail; accountType: AccountType }) {
  const available = book.availableCopies > 0;
  return (
    <>
      {book.lcCallNumber === null ? null : (
        <View style={styles.callNumber} testID="book-call-number">
          <Text style={styles.callNumberLabel}>Call number</Text>
          <View style={styles.callNumberPill}>
            <Text style={styles.callNumberText}>{book.lcCallNumber}</Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.cover}>
          <BookCover id={book.id} width={121} height={179} radius={radii.cover} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} testID="book-detail-title">
            {book.title}
          </Text>
          <Text style={styles.authors} testID="book-detail-authors">
            {book.authors.length > 0 ? book.authors.join("; ") : "Unknown author"}
          </Text>
          <View style={styles.tags}>
            {book.edition === null ? null : (
              <View style={[styles.tag, styles.editionTag]} testID="book-edition">
                <Text style={[styles.tagText, styles.editionText]}>{book.edition}</Text>
              </View>
            )}
            <View style={[styles.tag, available ? styles.availableTag : styles.noneTag]} testID="book-availability-pill">
              <Text style={[styles.tagText, available ? styles.availableText : styles.noneText]}>{availabilityPill(book)}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.stats} testID="book-stats">
        {book.publicationYear === null ? null : (
          <>
            <Stat value={String(book.publicationYear)} label="published" />
            <View style={styles.divider} />
          </>
        )}
        <Stat value={copiesLabel(book.totalCopies)} label="in the library" />
        <View style={styles.divider} />
        <Stat value={String(book.availableCopies)} label="available" />
      </View>

      {book.isbn === null ? null : (
        <View style={styles.details} testID="book-isbn">
          <Text style={styles.detailsHeading}>ISBN</Text>
          <Text style={styles.detailsBody}>{book.isbn}</Text>
        </View>
      )}

      {canBorrow(accountType) ? null : (
        <View style={styles.note} testID="cannot-borrow-note">
          <Text style={styles.noteTitle} accessibilityRole="header">
            {`${ACCOUNT_TYPE_LABELS[accountType]} accounts cannot borrow`}
          </Text>
          <Text style={styles.noteBody}>
            You can look at every book and see which Copies are available, to plan a visit to the library. Borrowing is for UMAK Students, Faculty and NTP / Employees.
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  callNumber: { alignItems: "center", gap: 5, alignSelf: "center", width: 164, marginBottom: spacing.xs },
  callNumberLabel: { fontFamily: fontFamily.monoLabel, fontSize: fontSize.body, color: colors.black, letterSpacing: -0.64 },
  callNumberPill: {
    alignSelf: "stretch",
    minHeight: 25,
    borderRadius: radii.callNumber,
    backgroundColor: colors.callNumber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  callNumberText: { fontFamily: fontFamily.mono, fontSize: fontSize.body, color: colors.black, letterSpacing: -0.64, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  cover: {
    borderRadius: radii.cover,
    elevation: 4,
    backgroundColor: colors.white,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
  },
  headerText: { flex: 1, gap: 6 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.headline, lineHeight: 26, letterSpacing: -2.56, color: colors.black },
  authors: { fontFamily: fontFamily.extraLight, fontSize: fontSize.subheading, letterSpacing: -0.8, color: colors.textMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  tag: { height: 20, borderRadius: radii.tag, paddingHorizontal: 10, justifyContent: "center" },
  tagText: { fontFamily: fontFamily.regular, fontSize: fontSize.micro, letterSpacing: -0.4 },
  editionTag: { backgroundColor: colors.selected },
  editionText: { color: colors.primary },
  availableTag: { backgroundColor: colors.availableSurface },
  availableText: { color: colors.availableText },
  noneTag: { backgroundColor: colors.pill },
  noneText: { color: colors.textMuted },
  stats: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  stat: { alignItems: "center", gap: 2 },
  statValue: { fontFamily: fontFamily.regular, fontSize: fontSize.large, letterSpacing: -0.96, color: colors.black },
  statLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.64, color: colors.textFaint },
  divider: { width: 1, height: 44, backgroundColor: colors.border },
  details: { gap: 7 },
  detailsHeading: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.64, color: colors.black },
  detailsBody: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.64, color: colors.textBody },
  note: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  noteTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  noteBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary },
});
