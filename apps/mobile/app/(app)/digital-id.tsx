import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDigitalId } from "@libras/shared";
import { useAuth } from "../../src/auth/AuthContext";
import { Button } from "../../src/components/Button";
import { Barcode } from "../../src/digital-id/Barcode";
import { useDigitalId, useSecondsLeft } from "../../src/digital-id/useDigitalId";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { useNewLoan } from "../../src/loans/useLoans";
import { cardShadow, colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/** Inner width of the dashed frame that the barcode may use, quiet zones included. */
const BARCODE_MAX_WIDTH = 294;
const BARCODE_HEIGHT = 96;

function mmss(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The Member's Digital ID (Figma "Show this to the librarian", 617:3265): a
 * Code 128 barcode with the same code printed beneath it, replaced by itself
 * every 60 seconds. The Figma frame also shows the Book being borrowed; this
 * screen identifies the Member only, so that card is left out here.
 *
 * While it is open the screen watches for a Loan: when the Librarian confirms
 * one at the desk, it gives way to "Successfully Borrowed".
 */
export default function DigitalIdScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const { state, retry } = useDigitalId();
  const secondsLeft = useSecondsLeft(state);
  const { request } = useAuth();
  useNewLoan(request, (loan) => router.replace({ pathname: "/borrowed", params: { loanId: loan.id } }));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.screen, { paddingTop: screenTop + 42, paddingBottom: insets.bottom + 25 }]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {"Show this to the "}
        <Text style={styles.highlight}>librarian</Text>
      </Text>
      <Text style={styles.subtitle}>Ask the librarian to scan this code to identify you at the desk.</Text>

      <View style={styles.ticket} testID="digital-id-ticket">
        {state.status === "ready" && (
          <>
            <Barcode digits={state.id.code} maxWidth={BARCODE_MAX_WIDTH} height={BARCODE_HEIGHT} testID="digital-id-barcode" />
            <Text style={styles.code} testID="digital-id-code" accessibilityLabel={`Code ${state.id.code.split("").join(" ")}`}>
              {formatDigitalId(state.id.code)}
            </Text>
          </>
        )}
        {state.status === "loading" && <ActivityIndicator color={colors.primary} size="large" testID="digital-id-loading" />}
        {state.status === "error" && (
          <View style={styles.failure}>
            <Text style={styles.failureText} testID="digital-id-error">
              {state.message}
            </Text>
            <Pressable accessibilityRole="button" onPress={retry} testID="digital-id-retry" hitSlop={8}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>

      {secondsLeft !== undefined && (
        <Text style={styles.waiting} testID="digital-id-countdown">
          {"Waiting for the librarian to scan... a new code in\n"}
          <Text style={styles.countdown}>{mmss(secondsLeft)}</Text>
        </Text>
      )}

      <View style={styles.action}>
        <Button label="Done" tone="outline" radius={radii.outlineButton} onPress={() => router.back()} testID="digital-id-done" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.white },
  screen: { flexGrow: 1, alignItems: "center", paddingHorizontal: spacing.screen },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.headline,
    letterSpacing: -1.28,
    color: colors.black,
    textAlign: "center",
    width: 292,
  },
  highlight: { color: colors.highlight },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    letterSpacing: -0.56,
    color: colors.textMuted,
    textAlign: "center",
    width: 316,
    marginTop: 13,
  },
  ticket: {
    alignSelf: "stretch",
    marginHorizontal: 5,
    marginTop: 27,
    minHeight: 186,
    paddingTop: 25,
    paddingBottom: 29,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 17,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: radii.ticket,
    backgroundColor: colors.white,
    boxShadow: cardShadow,
  },
  code: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.note,
    letterSpacing: 3.9,
    color: colors.black,
    textAlign: "center",
  },
  failure: { alignItems: "center", gap: spacing.md },
  failureText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.danger, textAlign: "center" },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, color: colors.primary },
  waiting: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.note,
    letterSpacing: 0.3,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 12,
  },
  countdown: { color: colors.black },
  action: { width: 280, marginTop: 26 },
});
