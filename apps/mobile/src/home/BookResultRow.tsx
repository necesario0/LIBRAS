import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BookSearchResult } from "@libras/shared";
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
 * One matched Book (the row of Figma Search C, node 1057:7346): a cover, the
 * title and authors, and a pill with how many Copies are available. Tapping it
 * opens the Book's page.
 */
export function BookResultRow({ book, onPress }: { book: BookSearchResult; onPress: () => void }) {
  const available = book.availableCopies > 0;
  const edition = book.edition === null ? "" : `, ${book.edition}`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row} testID={`book-${book.id}`}>
      <BookCover id={book.id} width={36} height={52} radius={6} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2} testID="book-title">
          {`${book.title}${edition}`}
        </Text>
        <Text style={styles.authors} numberOfLines={1}>
          {authorLine(book.authors)}
        </Text>
      </View>
      <View style={[styles.pill, available ? styles.pillAvailable : styles.pillNone]} testID="book-availability">
        <Text style={[styles.pillText, available && styles.pillTextAvailable]}>{availabilityLabel(book)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillAvailable: { backgroundColor: colors.successSurface },
  pillNone: { backgroundColor: colors.pill },
  pillText: { fontFamily: fontFamily.regular, fontSize: fontSize.micro, color: colors.black },
  pillTextAvailable: { color: colors.success },
});
