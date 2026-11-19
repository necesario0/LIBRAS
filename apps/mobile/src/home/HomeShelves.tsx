import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { BookSearchResult, HomeShelf } from "@libras/shared";
import { BookCover, coverColor } from "../components/BookCover";
import { colors, coverInk, fontFamily, fontSize, lineHeightFor, radii, shelfCover, spacing } from "../theme/tokens";

/** "Cruz, Isagani" becomes "Cruz"; with more authors, "Cruz et al."; no author, "Unknown author". */
export function shelfAuthor(authors: readonly string[]): string {
  const first = authors[0];
  if (first === undefined) return "Unknown author";
  return `${first.split(",")[0]?.trim() ?? first}${authors.length > 1 ? " et al." : ""}`;
}

/** A Book on a shelf: its cover with the title printed on it, then the title and the author. Tapping it opens the Book page. */
function ShelfBook({ book, shelf, onOpen }: { book: BookSearchResult; shelf: HomeShelf["kind"]; onOpen: (id: string) => void }) {
  const dark = coverColor(book.id) === coverInk.darkOn;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${shelfAuthor(book.authors)}`}
      onPress={() => onOpen(book.id)}
      style={styles.book}
      testID={`shelf-${shelf}-book-${book.id}`}
    >
      <View>
        <BookCover id={book.id} width={shelfCover.width} height={shelfCover.height} radius={radii.cover} />
        <View style={styles.coverTitle} pointerEvents="none">
          <Text style={[styles.coverText, { color: dark ? coverInk.dark : coverInk.light }]} numberOfLines={5}>
            {book.title}
          </Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2} testID="shelf-book-title">
        {book.title}
      </Text>
      <Text style={styles.author} numberOfLines={1}>
        {shelfAuthor(book.authors)}
      </Text>
    </Pressable>
  );
}

/** One shelf (approved Tier 3 preview): a heading, a one-line explanation and a horizontal row of covers. */
function Shelf({ shelf, onOpenBook }: { shelf: HomeShelf; onOpenBook: (id: string) => void }) {
  return (
    <View style={styles.shelf} testID={`shelf-${shelf.kind}`}>
      <View style={styles.heading}>
        <Text style={styles.headingText} accessibilityRole="header" testID={`shelf-${shelf.kind}-title`}>
          {shelf.title}
        </Text>
        <Text style={styles.subtitle}>{shelf.subtitle}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.rowScroll}
        testID={`shelf-${shelf.kind}-row`}
      >
        {shelf.books.map((book) => (
          <ShelfBook key={book.id} book={book} shelf={shelf.kind} onOpen={onOpenBook} />
        ))}
      </ScrollView>
    </View>
  );
}

/** The shelves of Home, in the order the API sends them. Nothing is drawn for a shelf the API left out. */
export function HomeShelves({ shelves, onOpenBook }: { shelves: readonly HomeShelf[]; onOpenBook: (id: string) => void }) {
  return (
    <View testID="home-shelves">
      {shelves.map((shelf) => (
        <Shelf key={shelf.kind} shelf={shelf} onOpenBook={onOpenBook} />
      ))}
    </View>
  );
}

/** The shelves could not be loaded: one quiet line and a way to try again. Home still works without them. */
export function ShelvesFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.failed} testID="home-shelves-error">
      <Text style={styles.failedText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} testID="home-shelves-retry">
        <Text style={styles.retry}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { marginTop: spacing.xl },
  heading: { gap: 2 },
  headingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.subheading,
    lineHeight: lineHeightFor(fontSize.subheading),
    letterSpacing: -0.9,
    color: colors.black,
  },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.resultMeta, lineHeight: lineHeightFor(fontSize.resultMeta), color: colors.textMuted },
  // The row runs to the screen's edges: it cancels the screen's side gutter and puts it back as padding, so covers scroll under the edge.
  rowScroll: { marginHorizontal: -spacing.home, marginTop: spacing.inset },
  row: { paddingHorizontal: spacing.home, paddingBottom: 6, gap: spacing.md },
  book: { width: shelfCover.width, gap: 5 },
  coverTitle: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end", paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingRight: 7, paddingLeft: 16 },
  coverText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.resultNote, lineHeight: lineHeightFor(fontSize.resultNote), letterSpacing: -0.2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.resultNote, lineHeight: lineHeightFor(fontSize.resultNote), color: colors.black },
  author: { fontFamily: fontFamily.regular, fontSize: fontSize.micro, lineHeight: lineHeightFor(fontSize.micro), color: colors.textMuted },
  failed: { marginTop: spacing.xl, gap: spacing.xs, paddingHorizontal: spacing.xs },
  failedText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.textMuted },
  retry: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.primary },
});
