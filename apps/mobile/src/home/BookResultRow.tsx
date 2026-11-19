import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BookSearchResult, CatalogSearchRow } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** "Cruz, Isagani" and "Santos, Maria" become "Cruz, Isagani; Santos, Maria". */
function authorLine(authors: readonly string[]): string {
  return authors.length > 0 ? authors.join("; ") : "Unknown author";
}

/** How many Copies can be borrowed now, in words: "2 of 3 available" or "None available". */
export function availabilityLabel(book: Pick<BookSearchResult, "availableCopies" | "totalCopies">): string {
  if (book.totalCopies === 0) return "No copies";
  if (book.availableCopies === 0) return "None available";
  return `${book.availableCopies} of ${book.totalCopies} available`;
}

/**
 * One matched Book (the row of Figma Search C, node 1057:7346, as the approved
 * Tier 3 preview lays it out): a cover, the title with its edition, the authors,
 * the publication year and the Subject ("2019 · Computer Science"), and a pill
 * with how many Copies are available. Tapping it opens the Book's page.
 */
export function BookResultRow({ book, onPress }: { book: BookSearchResult; onPress: () => void }) {
  const available = book.availableCopies > 0;
  const edition = book.edition === null ? "" : `, ${book.edition}`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row} testID={`book-${book.id}`}>
      <BookCover id={book.id} width={36} height={52} radius={radii.coverSmall} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2} testID="book-title">
          {`${book.title}${edition}`}
        </Text>
        <Text style={styles.authors} numberOfLines={1}>
          {authorLine(book.authors)}
        </Text>
        {book.publicationYear === null && book.subject === null ? null : (
          <Text style={styles.meta} numberOfLines={1} testID="book-meta">
            {[book.publicationYear === null ? null : String(book.publicationYear), book.subject].filter((part) => part !== null).join(" · ")}
          </Text>
        )}
      </View>
      <View style={[styles.pill, available ? styles.pillAvailable : styles.pillNone]} testID="book-availability">
        <Text style={[styles.pillText, available && styles.pillTextAvailable]}>{availabilityLabel(book)}</Text>
      </View>
    </Pressable>
  );
}

/** "Also in 2 older editions", or "Hide 2 older editions" once they are open. */
export function olderEditionsLabel(count: number, open: boolean): string {
  return `${open ? "Hide" : "Also in"} ${count} older ${count === 1 ? "edition" : "editions"}`;
}

/**
 * A row of search results: the Book it shows and, when editions are folded,
 * "Also in N older editions", which opens the older editions inline (each opens
 * its own Book page).
 */
export function SearchResultRow({ row, onOpenBook }: { row: CatalogSearchRow; onOpenBook: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const older = row.olderEditions;
  return (
    <View style={styles.result}>
      <BookResultRow book={row} onPress={() => onOpenBook(row.id)} />
      {older.length === 0 ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.olderToggle}
          hitSlop={{ top: 6, bottom: 6 }}
          testID={`book-${row.id}-older`}
        >
          <Text style={styles.olderText}>{`${olderEditionsLabel(older.length, open)}${open ? "" : " ›"}`}</Text>
        </Pressable>
      )}
      {open ? (
        <View style={styles.olderList} testID={`book-${row.id}-older-list`}>
          {older.map((edition) => (
            <BookResultRow key={edition.id} book={edition} onPress={() => onOpenBook(edition.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  result: { borderBottomWidth: 1, borderBottomColor: colors.pill, paddingBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingTop: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: 18, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.textMuted },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.resultMeta, lineHeight: 14, color: colors.textBody },
  olderToggle: { alignSelf: "flex-start", paddingTop: spacing.xs },
  olderText: { fontFamily: fontFamily.medium, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.primary },
  olderList: { marginLeft: 48 },
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillAvailable: { backgroundColor: colors.successSurface },
  pillNone: { backgroundColor: colors.pill },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.micro, lineHeight: 13, color: colors.black },
  pillTextAvailable: { color: colors.success },
});
