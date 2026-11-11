import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, controlHeight, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { CheckIcon } from "./icons";

interface OptionRowProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  /** Greyed out and not selectable, with a short note on the right. */
  unavailableNote?: string;
}

/** One row of the account type list: a radio and a label (Figma "Account type list"). */
export function OptionRow({ label, selected, onPress, testID, unavailableNote }: OptionRowProps) {
  const unavailable = unavailableNote !== undefined;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: unavailable }}
      onPress={unavailable ? undefined : onPress}
      testID={testID}
      style={[styles.row, selected && styles.rowSelected, unavailable && styles.rowUnavailable]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <CheckIcon /> : null}</View>
      <Text style={styles.label}>{label}</Text>
      {unavailable ? <Text style={styles.note}>{unavailableNote}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: controlHeight,
    borderRadius: radii.option,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowSelected: { backgroundColor: colors.selected, borderColor: colors.primary },
  rowUnavailable: { opacity: 0.55 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.body, color: colors.link },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.textMuted },
});
