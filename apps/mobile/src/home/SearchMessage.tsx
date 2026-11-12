import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The search ran and nothing matched. A normal answer: neutral colours, no retry. */
export function NoResults({ query }: { query: string }) {
  return (
    <View style={styles.panel} testID="search-no-results">
      <Text style={styles.title} accessibilityRole="header">
        No books found
      </Text>
      <Text style={styles.body}>{`Nothing in the catalog matches “${query}”. Check the spelling, or try fewer words, an author's name or an ISBN.`}</Text>
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
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary },
  action: { marginTop: spacing.sm },
});
