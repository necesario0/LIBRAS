import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { Wordmark } from "../components/Wordmark";
import { useScreenTop } from "../hooks/useScreenTop";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

/**
 * Shown instead of the app when a stored session could not be checked because
 * the server could not be reached. The Member is not signed out: trying again
 * picks up where they were.
 */
export function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const screenTop = useScreenTop();
  return (
    <View style={[styles.screen, { paddingTop: screenTop + 16 }]}>
      <Wordmark />
      <Text style={styles.title} accessibilityRole="header">
        We could not reach the library
      </Text>
      <Text style={styles.message} testID="startup-error-message">
        {message}
      </Text>
      <View style={styles.action}>
        <Button label="Try again" onPress={onRetry} testID="startup-error-retry" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, alignItems: "center", paddingHorizontal: spacing.screen },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.subheading, color: colors.black, textAlign: "center", marginTop: 96 },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 300,
  },
  action: { alignSelf: "stretch", marginTop: spacing.xxl },
});
