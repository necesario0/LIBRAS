import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogSuggestion } from "@libras/shared";
import { BookOutlineIcon, PersonOutlineIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

interface SuggestionsProps {
  query: string;
  suggestions: readonly CatalogSuggestion[];
  onTitle: (bookId: string) => void;
  onAuthor: (name: string) => void;
}

/** The text with the part the Member typed in bold (the first place it occurs, any letter case). */
function Marked({ text, query }: { text: string; query: string }) {
  const typed = query.trim();
  const at = typed === "" ? -1 : text.toLowerCase().indexOf(typed.toLowerCase());
  if (at < 0) {
    return (
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={styles.text} numberOfLines={1}>
      {text.slice(0, at)}
      <Text style={styles.bold}>{text.slice(at, at + typed.length)}</Text>
      {text.slice(at + typed.length)}
    </Text>
  );
}

/** What search mode shows while typing: up to 5 title and author suggestions, or a hint to press search when there are none. */
export function Suggestions({ query, suggestions, onTitle, onAuthor }: SuggestionsProps) {
  if (suggestions.length === 0) {
    return (
      <Text style={styles.hint} testID="search-hint">
        {`Press search to look for “${query.trim()}” in titles, authors, ISBNs and call numbers.`}
      </Text>
    );
  }
  return (
    <View testID="suggestions">
      <Text style={styles.label}>SUGGESTIONS</Text>
      {suggestions.map((suggestion) => {
        const title = suggestion.kind === "title";
        return (
          <Pressable
            key={title ? `t-${suggestion.bookId}` : `a-${suggestion.text}`}
            accessibilityRole="button"
            onPress={() => (suggestion.kind === "title" ? onTitle(suggestion.bookId) : onAuthor(suggestion.text))}
            style={styles.row}
            testID={title ? "suggestion-title" : "suggestion-author"}
          >
            {title ? <BookOutlineIcon color={colors.textMuted} size={18} /> : <PersonOutlineIcon color={colors.textMuted} size={18} />}
            <View style={styles.textBox}>
              <Marked text={suggestion.text} query={query} />
            </View>
            <Text style={styles.kind}>{title ? "Title" : "Author"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.listLabel, lineHeight: 15, letterSpacing: 0.84, color: colors.textMuted, marginTop: 20, marginBottom: 6 },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textMuted, marginTop: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.pill },
  textBox: { flex: 1, minWidth: 0 },
  text: { fontFamily: fontFamily.regular, fontSize: fontSize.listRow, lineHeight: 20, color: colors.black },
  bold: { fontFamily: fontFamily.semiBold },
  kind: { fontFamily: fontFamily.regular, fontSize: fontSize.listLabel, lineHeight: 15, color: colors.textMuted, paddingLeft: spacing.sm },
});
