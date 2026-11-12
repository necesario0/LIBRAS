import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../auth/AuthContext";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { currentLoans, useLoans } from "./useLoans";
import type { LoansState } from "./useLoans";

/** "2 current Loans, 1 overdue", "No current Loans" or a word about loading. */
export function loansSummaryText(state: LoansState): string {
  if (state.status === "loading") return "Checking your Loans";
  if (state.status === "error") return "Could not load your Loans. Tap to open them.";
  const current = currentLoans(state.loans);
  if (current.length === 0) return "No current Loans";
  const overdue = current.filter((loan) => loan.overdue).length;
  const count = current.length === 1 ? "1 current Loan" : `${current.length} current Loans`;
  return overdue === 0 ? count : `${count}, ${overdue} overdue`;
}

/** Home's summary of the Member's Loans: how many Copies are out and how many are overdue, and the way to My Loans. */
export function LoansSummary() {
  const router = useRouter();
  const { request } = useAuth();
  const { state } = useLoans(request);
  const overdue = state.status === "loaded" && currentLoans(state.loans).some((loan) => loan.overdue);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`My Loans. ${loansSummaryText(state)}`}
      onPress={() => router.push("/loans")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID="home-loans"
    >
      <View style={styles.icon}>
        <Svg width={22} height={22} viewBox="0 0 22 22" accessibilityElementsHidden importantForAccessibility="no">
          <Path
            d="M4 2h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V2zM4 18a2 2 0 0 1 2-2h12M8 6h6"
            stroke={colors.black}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>My Loans</Text>
        <Text style={[styles.subtitle, overdue && styles.overdue]} testID="home-loans-summary">
          {loansSummaryText(state)}
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
    // The same 2 pt frame as the Digital ID entry and the Holds card, so the three cards line up.
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.ticket,
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surface },
  icon: { width: 44, height: 44, borderRadius: radii.panel, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.body, color: colors.black },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  overdue: { color: colors.danger },
});
