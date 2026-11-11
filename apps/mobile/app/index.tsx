import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logo from "../assets/images/libras-logo.png";
import { Button } from "../src/components/Button";
import { useHealth } from "../src/hooks/useHealth";
import { colors, radii, spacing, typography } from "../src/theme/tokens";

/** The shell's only screen: shows what `GET /health` says about the API. */
export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { state, retry } = useHealth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.brand}>
        <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.brandName}>Libras</Text>
      </View>
      <Text style={styles.tagline}>The library for problem solver</Text>

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
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  logo: { width: 31, height: 31, borderRadius: 16 },
  brandName: { ...typography.title, color: colors.black },
  tagline: { ...typography.hero, color: colors.black, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.xl, gap: spacing.lg },
  cardTitle: { ...typography.bodyStrong, color: colors.black },
  rows: { gap: spacing.sm },
  row: { ...typography.body, color: colors.black },
  muted: { ...typography.small, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
