import { Pressable, StyleSheet, Text, View } from "react-native";
import { bookAvailabilityLabel } from "@libras/shared";
import type { SavedBook } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { SavedFilledIcon } from "../components/OutlineIcons";
import { StatusPill } from "../components/StatusPill";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

interface SavedBookRowProps {
  book: SavedBook;
  onOpen: (book: SavedBook) => void;
  onRemove: (book: SavedBook) => void;
}

/**
 * One Saved book (approved Tier 3 preview): the cover, the title, the author
 * and the availability pill. Tapping the row opens the Book; the filled
 * bookmark at the right removes it from Saved.
 */
export function SavedBookRow({ book, onOpen, onRemove }: SavedBookRowProps) {
  const available = book.availableCopies > 0;
  return (
    <View style={styles.row} testID={`saved-${book.bookId}`}>
      <Pressable accessibilityRole="button" onPress={() => onOpen(book)} style={styles.open} testID="saved-open">
        <BookCover id={book.bookId} width={36} height={52} radius={radii.coverSmall} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2} testID="saved-title">
            {book.title}
          </Text>
          <Text style={styles.authors} numberOfLines={1}>
            {book.authors.length > 0 ? book.authors.join("; ") : "Unknown author"}
          </Text>
          <View style={styles.pill}>
            <StatusPill label={bookAvailabilityLabel(book)} tone={available ? "available" : "neutral"} testID="saved-availability" />
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${book.title} from Saved`}
        hitSlop={8}
        onPress={() => onRemove(book)}
        style={styles.remove}
        testID="saved-remove"
      >
        <SavedFilledIcon color={colors.black} size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surface },
  open: { flex: 1, flexDirection: "row", gap: spacing.md, minWidth: 0 },
  text: { flex: 1, gap: 3 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.textMuted },
  pill: { alignSelf: "flex-start", marginTop: spacing.xs },
  remove: { padding: spacing.xs },
});
