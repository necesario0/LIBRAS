import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatDigitalId } from "@libras/shared";
import { ClockIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { Barcode } from "./Barcode";
import { useDigitalId, useSecondsLeft } from "./useDigitalId";

const BARCODE_HEIGHT = 96;
/** The ticket's 2 pt dashed border and 16 pt padding on each side: what it takes from the width it is given. */
export const TICKET_INSET = 2 * 2 + 2 * spacing.lg;

function minutesSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The Member's live Digital ID in its dashed frame (Figma "Show this to the
 * librarian", 617:3265): the Code 128 barcode, the same code printed beneath
 * it, and the countdown to the next code. It fetches and refreshes the code
 * itself (`useDigitalId`) while it is mounted. The Digital ID tab and the
 * Borrow sheet of the Book page both show it; `testID` names its parts
 * (`<testID>-code`, `<testID>-countdown`, ...).
 */
export function DigitalIdTicket({ barcodeWidth, testID }: { barcodeWidth: number; testID: string }) {
  const { state, retry } = useDigitalId();
  const secondsLeft = useSecondsLeft(state);

  return (
    <View style={styles.ticket} testID={`${testID}-ticket`}>
      {state.status === "ready" && (
        <>
          <Barcode digits={state.id.code} maxWidth={barcodeWidth} height={BARCODE_HEIGHT} testID={`${testID}-barcode`} />
          <Text style={styles.code} testID={`${testID}-code`} accessibilityLabel={`Code ${state.id.code.split("").join(" ")}`}>
            {formatDigitalId(state.id.code)}
          </Text>
        </>
      )}
      {state.status === "loading" && <ActivityIndicator color={colors.primary} size="large" testID={`${testID}-loading`} />}
      {state.status === "error" && (
        <View style={styles.failure}>
          <Text style={styles.failureText} testID={`${testID}-error`}>
            {state.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} testID={`${testID}-retry`} hitSlop={8}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      )}
      {secondsLeft !== undefined && (
        <View style={styles.countdown}>
          <ClockIcon color={colors.textBody} size={16} />
          <Text style={styles.countdownText} testID={`${testID}-countdown`}>
            {"New code in "}
            <Text style={styles.countdownTime}>{minutesSeconds(secondsLeft)}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: spacing.lg,
    minHeight: 186,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.ticket,
  },
  code: { fontFamily: fontFamily.mono, fontSize: fontSize.note, letterSpacing: 2.7, lineHeight: 20, color: colors.black },
  countdown: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countdownText: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 17, color: colors.textBody },
  countdownTime: { fontFamily: fontFamily.semiBold, color: colors.black },
  failure: { alignItems: "center", gap: spacing.md },
  failureText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 19, color: colors.danger, textAlign: "center" },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, lineHeight: 19, color: colors.primary },
});
