import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

interface ToastProps {
  message: string;
  /** A text button in the toast, such as Undo. */
  action?: { label: string; onPress: () => void; testID: string };
  /** How far the toast floats above the bottom of its screen. */
  bottom: number;
  testID: string;
}

/**
 * The short message at the foot of a screen (approved Tier 3 preview): a dark
 * pill with the message and, when there is one, a yellow text button. The
 * caller decides how long it stays.
 */
export function Toast({ message, action, bottom, testID }: ToastProps) {
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={styles.toast} accessibilityLiveRegion="polite" testID={testID}>
        <Text style={styles.text}>{message}</Text>
        {action === undefined ? null : (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={action.onPress} testID={action.testID}>
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.screen, right: spacing.screen, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: spacing.inset,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pillButton,
    backgroundColor: colors.ink,
  },
  text: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.white },
  action: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.accent },
});
