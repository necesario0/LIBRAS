import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { MagnifierIcon } from "../components/OutlineIcons";
import { RowAction } from "../components/RowConfirmation";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/**
 * The search ran and nothing matched. A normal answer: neutral colours, no retry.
 * With filters on (Available now or any filter of the sheet) it is the preview's
 * "No Books match" with a Clear filters button, since the filters may be what
 * left everything out.
 */
export function NoResults({ query, filtered, onClearFilters }: { query: string; filtered: boolean; onClearFilters: () => void }) {
  if (filtered) {
    return (
      <View style={styles.empty} testID="search-no-results">
        <View style={styles.ring}>
          <MagnifierIcon color={colors.textMuted} size={26} />
        </View>
        <Text style={styles.emptyTitle} accessibilityRole="header">
          No Books match
        </Text>
        <Text style={styles.emptyBody}>Try fewer filters or another spelling.</Text>
        <RowAction label="Clear filters" onPress={onClearFilters} testID="search-clear-filters" />
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="search-no-results">
      <Text style={styles.title} accessibilityRole="header">
        No books found
      </Text>
      <Text style={styles.body}>
        {`Nothing in the catalog matches “${query}”. Check the spelling, or try fewer words, an author's name or an ISBN.`}
      </Text>
    </View>
  );
}

/** The search could not run (no connection, the library service is down). Different from "no results": it says so and offers a retry. */
export function SearchFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[styles.panel, styles.failed]} testID="search-error">
      <Text style={[styles.title, styles.failedTitle]} accessibilityRole="alert">
        Search is not working
      </Text>
      <Text style={styles.body}>{message}</Text>
      <View style={styles.action}>
        <Button label="Try again" radius={radii.formButton} onPress={onRetry} testID="search-retry" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radii.panel,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  failed: { borderColor: colors.error },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: spacing.md, gap: 10 },
  ring: { width: 64, height: 64, borderRadius: radii.iconRing, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.emptyTitle, lineHeight: 24, color: colors.black, marginTop: spacing.xs },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 19, color: colors.textMuted, textAlign: "center", maxWidth: 250 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, lineHeight: 21, color: colors.black },
  failedTitle: { color: colors.danger },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 19, color: colors.textSecondary },
  action: { marginTop: spacing.sm },
});
