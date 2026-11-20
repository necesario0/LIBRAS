import { StyleSheet, Text, View } from "react-native";
import { ACCOUNT_TYPE_LABELS, bookAvailabilityLabel, canBorrow, isInLibraryOnlyAccount } from "@libras/shared";
import type { AccountType, BookDetail } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { BookTexts } from "./BookTexts";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/** The cover on the Book page (approved Tier 3 preview). */
const COVER = { width: 112, height: 164 } as const;

/** A tag under the authors: the edition, the year, availability, or the Subject. */
function Tag({ label, tone = "plain", testID }: { label: string; tone?: "plain" | "available" | "none" | "subject"; testID: string }) {
  return (
    <View style={[styles.tag, tone === "available" && styles.availableTag, tone === "none" && styles.noneTag, tone === "subject" && styles.subjectTag]}>
      <Text
        style={[
          styles.tagText,
          tone === "available" && styles.availableText,
          tone === "none" && styles.noneText,
          tone === "subject" && styles.subjectText,
        ]}
        testID={testID}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The body of the Book sheet, laid out as the approved Tier 3 preview (style
 * from Figma 609:1066): the cover beside the title, the authors and the tags
 * (edition, year, how many Copies are available, and the Subject pill), then
 * the call number, the ISBN, the summary and contents, and the note for an
 * Account Type that cannot borrow. The title and the authors wrap as far as they need to; the tags
 * always come after them, never over them.
 */
export function BookInfo({ book, accountType }: { book: BookDetail; accountType: AccountType }) {
  const available = book.availableCopies > 0;
  return (
    <>
      <View style={styles.top}>
        <View style={styles.header}>
          <View style={styles.cover}>
            <BookCover id={book.id} width={COVER.width} height={COVER.height} radius={radii.cover} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} testID="book-detail-title">
              {book.title}
            </Text>
            <Text style={styles.authors} testID="book-detail-authors">
              {book.authors.length > 0 ? book.authors.join("; ") : "Unknown author"}
            </Text>
            <View style={styles.tags}>
              {book.edition === null ? null : <Tag label={book.edition} testID="book-edition" />}
              {book.publicationYear === null ? null : <Tag label={String(book.publicationYear)} testID="book-year" />}
              <Tag label={bookAvailabilityLabel(book)} tone={available ? "available" : "none"} testID="book-availability-pill" />
              {book.subject === null ? null : <Tag label={book.subject} tone="subject" testID="book-subject" />}
            </View>
          </View>
        </View>

        {book.lcCallNumber === null ? null : (
          <View style={styles.classification}>
            <View style={styles.callNumber} testID="book-call-number">
              <Text style={styles.callNumberLabel}>CALL NO.</Text>
              <Text style={styles.callNumberText}>{book.lcCallNumber}</Text>
            </View>
          </View>
        )}
      </View>

      {book.isbn === null ? null : (
        <View style={styles.details} testID="book-isbn">
          <Text style={styles.detailsHeading}>ISBN</Text>
          <Text style={styles.detailsBody}>{book.isbn}</Text>
        </View>
      )}

      <BookTexts book={book} />

      {!canBorrow(accountType) ? (
        <View style={styles.note} testID="cannot-borrow-note">
          <Text style={styles.noteTitle} accessibilityRole="header">
            {`${ACCOUNT_TYPE_LABELS[accountType]} accounts cannot borrow`}
          </Text>
          <Text style={styles.noteBody}>
            You can look at every book and see which Copies are available, to plan a visit to the library. Borrowing is for UMAK Students, Faculty and NTP / Employees.
          </Text>
        </View>
      ) : isInLibraryOnlyAccount(accountType) && book.availableCopies === 0 ? (
        <View style={styles.note} testID="in-library-unavailable-note">
          <Text style={styles.noteTitle} accessibilityRole="header">
            {`${ACCOUNT_TYPE_LABELS[accountType]} in-library borrowing`}
          </Text>
          <Text style={styles.noteBody}>
            No Copy is available on the shelf right now. You can save this Book and borrow it at the desk for in-library reading once a Copy is returned.
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  cover: {
    borderRadius: radii.cover,
    elevation: 4,
    backgroundColor: colors.white,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
  },
  headerText: { flex: 1, minWidth: 0, gap: 6 },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bookTitle,
    lineHeight: lineHeightFor(fontSize.bookTitle),
    letterSpacing: -0.8,
    color: colors.black,
  },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.textMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tag: {
    borderRadius: radii.tag,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.inset - 1,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  tagText: { fontFamily: fontFamily.medium, fontSize: fontSize.tag, lineHeight: lineHeightFor(fontSize.tag), color: colors.black },
  availableTag: { backgroundColor: colors.availableSurface, borderColor: colors.availableSurface },
  availableText: { color: colors.availableText },
  noneTag: { backgroundColor: colors.pill, borderColor: colors.pill },
  noneText: { color: colors.textMuted },
  subjectTag: { backgroundColor: colors.selected, borderColor: colors.selected },
  subjectText: { fontFamily: fontFamily.semiBold, color: colors.brandInk },
  classification: { alignItems: "flex-start", gap: 10 },
  callNumber: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.callNumber,
    backgroundColor: colors.callNumber,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  callNumberLabel: { fontFamily: fontFamily.monoLabel, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.black },
  callNumberText: { fontFamily: fontFamily.mono, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.black },
  details: { gap: 7 },
  detailsHeading: { fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), letterSpacing: -0.64, color: colors.black },
  detailsBody: { fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), letterSpacing: -0.64, color: colors.textBody },
  note: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  noteTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), color: colors.black },
  noteBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.textSecondary },
});
