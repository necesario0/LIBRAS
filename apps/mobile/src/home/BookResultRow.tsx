import { StyleSheet, Text, View } from "react-native";
import type { BookSearchResult } from "@libras/shared";
import { bookCovers, colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** "Cruz, Isagani" and "Santos, Maria" become "Cruz, Isagani; Santos, Maria". */
function authorLine(authors: readonly string[]): string {
  return authors.length > 0 ? authors.join("; ") : "Unknown author";
}

function coverColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return bookCovers[hash % bookCovers.length] ?? bookCovers[0];
}

/** How many Copies can be borrowed now, in words: "2 of 3 available" or "None available". */
export function availabilityLabel(book: Pick<BookSearchResult, "availableCopies" | "totalCopies">): string {
  if (book.totalCopies === 0) return "No copies";
  if (book.availableCopies === 0) return "None available";
  return `${book.availableCopies} of ${book.totalCopies} available`;
}

/**
 * One matched Book (the row of Figma Search C, node 1057:7346): a cover, the
 * title and authors, and a pill with how many Copies are available.
 */
export function BookResultRow({ book }: { book: BookSearchResult }) {
  const available = book.availableCopies > 0;
  const edition = book.edition === null ? "" : `, ${book.edition}`;
  return (
    <View style={styles.row} testID={`book-${book.id}`}>
      <View style={[styles.cover, { backgroundColor: coverColor(book.id) }]}>
        <View style={styles.spine} />
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  cover: { width: 36, height: 52, borderRadius: 6, overflow: "hidden" },
  spine: { position: "absolute", left: 5, top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.35)" },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillAvailable: { backgroundColor: colors.successSurface },
  pillNone: { backgroundColor: colors.pill },
  pillText: { fontFamily: fontFamily.regular, fontSize: fontSize.micro, color: colors.black },
  pillTextAvailable: { color: colors.success },
});
