import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../auth/AuthContext";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { useHolds } from "./useHolds";
import type { HoldsState } from "./useHolds";

/** "2 waiting, 1 ready for pickup", "No Holds yet" or a word about loading. */
export function holdsSummaryText(state: HoldsState): string {
  if (state.status === "loading") return "Checking your Holds";
  if (state.status === "error") return "Could not load your Holds. Tap to open them.";
  const waiting = state.holds.filter((hold) => hold.status === "waiting").length;
  const ready = state.holds.filter((hold) => hold.status === "ready").length;
  if (waiting === 0 && ready === 0) return "No active Holds";
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} waiting`);
  if (ready > 0) parts.push(`${ready} ready for pickup`);
  return parts.join(", ");
}

/** Home's summary of the Member's Holds: how many are waiting and ready, and the way to the Holds screen. */
export function HoldsSummary() {
  const router = useRouter();
  const { request } = useAuth();
  const { state } = useHolds(request);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`My Holds. ${holdsSummaryText(state)}`}
      onPress={() => router.push("/holds")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID="home-holds"
    >
      <View style={styles.icon}>
        <Svg width={20} height={22} viewBox="0 0 20 22" accessibilityElementsHidden importantForAccessibility="no">
          <Path d="M3 1h14a1 1 0 0 1 1 1v19l-8-5-8 5V2a1 1 0 0 1 1-1z" stroke={colors.black} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>My Holds</Text>
        <Text style={styles.subtitle} testID="home-holds-summary">
          {holdsSummaryText(state)}
        </Text>
      </View>
      <Svg width={8} height={14} viewBox="0 0 8 14" accessibilityElementsHidden importantForAccessibility="no">
        <Path d="M1 1l6 6-6 6" stroke={colors.textMuted} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.ticket,
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surface },
  icon: { width: 44, height: 44, borderRadius: radii.panel, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.body, color: colors.black },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
});
