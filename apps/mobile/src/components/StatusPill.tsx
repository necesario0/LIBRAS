import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/**
 * What a status says, which sets the pill's fill and text colour: done with or
 * gone (`neutral`), under way (`info`), in hand and fine (`available`),
 * completed (`success`) and in trouble (`danger`).
 */
export type PillTone = "neutral" | "info" | "available" | "success" | "danger";

const TONES: Readonly<Record<PillTone, { surface: string; text: string }>> = {
  neutral: { surface: colors.pill, text: colors.textMuted },
  info: { surface: colors.selected, text: colors.primary },
  available: { surface: colors.availableSurface, text: colors.availableText },
  success: { surface: colors.successSurface, text: colors.success },
  danger: { surface: colors.dangerSurface, text: colors.danger },
};

interface StatusPillProps {
  label: string;
  tone: PillTone;
  /** The label's text size: the small pill of a list row (default) or the larger one of a panel header. */
  size?: number;
  /** Placed on the label, so a test can read its text by id. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A small rounded status label: Loans, Holds and Clearance show where they stand in one. */
export function StatusPill({ label, tone, size = fontSize.micro, testID, style }: StatusPillProps) {
  const { surface, text } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: surface }, style]}>
      <Text style={[styles.label, { color: text, fontSize: size }]} testID={testID}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  label: { fontFamily: fontFamily.medium },
});
