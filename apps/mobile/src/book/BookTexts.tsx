import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TextLayoutEvent } from "react-native";
import { contentsChapters } from "@libras/shared";
import type { BookDetail } from "@libras/shared";
import { ChevronBackIcon } from "../components/icons";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

/** The summary shows this many lines before "Read more". */
export const SUMMARY_LINES = 4;

/** "About this book": the summary, cut to a few lines with "Read more" when it is longer. */
function Summary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);
  // Whether the whole text needs more lines than the cut. It is measured on an invisible copy with no limit, so it
  // does not depend on how a platform reports the lines of a text that is cut.
  const [overflows, setOverflows] = useState(false);
  const measure = (event: TextLayoutEvent) => setOverflows(event.nativeEvent.lines.length > SUMMARY_LINES);

  return (
    <View style={styles.section} testID="book-summary">
      <Text style={styles.heading} accessibilityRole="header">
        About this book
      </Text>
      {/* Screen readers read the whole text even while it is cut, as the text itself is complete. */}
      <Text style={styles.body} numberOfLines={expanded ? undefined : SUMMARY_LINES} testID="book-summary-text">
        {summary}
      </Text>
      <Text
        style={[styles.body, styles.measure]}
        onTextLayout={measure}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
      >
        {summary}
      </Text>
      {overflows ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          hitSlop={8}
          style={styles.toggle}
          testID="book-summary-toggle"
        >
          <Text style={styles.toggleText}>{expanded ? "Show less" : "Read more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Contents": a row that opens the chapters, one per line. Folded until the Member opens it. */
function Contents({ contents }: { contents: string }) {
  const [open, setOpen] = useState(false);
  const chapters = contentsChapters(contents);
  if (chapters.length === 0) return null;

  return (
    <View style={styles.section} testID="book-contents">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Contents"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={styles.contentsRow}
        testID="book-contents-toggle"
      >
        <Text style={styles.heading}>Contents</Text>
        <ChevronBackIcon rotate={open ? 90 : 270} />
      </Pressable>
      {open ? (
        <View style={styles.chapters} testID="book-contents-list">
          {chapters.map((chapter, index) => (
            <Text key={`${index}-${chapter}`} style={styles.body}>
              {chapter}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The Book's own texts, between its facts and the action: the summary and the
 * table of contents when the catalog has them. A Book with neither draws nothing,
 * no heading and no space. Both are shown as plain text.
 */
export function BookTexts({ book }: { book: Pick<BookDetail, "summary" | "contents"> }) {
  const summary = book.summary?.trim() ?? "";
  const contents = book.contents ?? "";
  const hasContents = contentsChapters(contents).length > 0;
  if (summary === "" && !hasContents) return null;
  return (
    <>
      {summary === "" ? null : <Summary summary={summary} />}
      {hasContents ? <Contents contents={contents} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: 24, letterSpacing: -0.64, color: colors.black },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 20, letterSpacing: -0.4, color: colors.textBody },
  // Same width and text as the visible summary, taken out of the layout and never seen or read.
  measure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  toggle: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
  toggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: 20, color: colors.primary },
  contentsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 },
  chapters: { gap: spacing.sm },
});
