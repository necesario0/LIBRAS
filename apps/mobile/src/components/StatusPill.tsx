import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, fontSize, radii, spacing } from "../theme/tokens";

interface StatusPillProps {
  label: string;
  /** Fill of the pill. */
  surface: string;
  /** Colour of the label. */
  text: string;
  /** The label's text size: the small pill of a list row (default) or the larger one of a panel header. */
  size?: number;
  /** Placed on the label, so a test can read its text by id. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A small rounded status label: Loans, Holds and Clearance show where they stand in one. */
export function StatusPill({ label, surface, text, size = fontSize.micro, testID, style }: StatusPillProps) {
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
