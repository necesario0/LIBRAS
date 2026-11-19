import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { Wordmark } from "../src/components/Wordmark";
import { useHealth } from "../src/hooks/useHealth";
import { colors, radii, spacing, typography } from "../src/theme/tokens";

/** Developer check, reached by the link `libras://status`: shows what `GET /health` says about the API. */
export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { state, retry } = useHealth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Wordmark />
      <Text style={styles.tagline}>Every shelf, within reach.</Text>

      <View style={styles.card} testID="health-card">
        <Text style={styles.cardTitle}>Service status</Text>
        {state.status === "loading" && <ActivityIndicator color={colors.primary} testID="health-loading" />}
        {state.status === "ok" && (
          <View style={styles.rows}>
            <Text style={styles.row} testID="health-api">{`API status: ${state.health.status}`}</Text>
            <Text style={styles.row} testID="health-database">{`Database: ${state.health.database}`}</Text>
            <Text style={styles.muted}>{`Server time: ${state.health.time}`}</Text>
          </View>
        )}
        {state.status === "error" && (
          <View style={styles.rows}>
            <Text style={styles.error} testID="health-error">{state.message}</Text>
            <Button label="Try again" onPress={retry} testID="health-retry" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: spacing.screen, gap: spacing.xl },
  tagline: { ...typography.hero, color: colors.black, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.xl, gap: spacing.lg },
  cardTitle: { ...typography.bodyStrong, color: colors.black },
  rows: { gap: spacing.sm },
  row: { ...typography.body, color: colors.black },
  muted: { ...typography.small, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
