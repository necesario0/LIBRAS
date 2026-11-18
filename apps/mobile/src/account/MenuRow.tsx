import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { ChevronRightIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, menuRowShadow, spacing } from "../theme/tokens";

/** The corner radius of a Profile row (approved Tier 3 preview). */
const ROW_RADIUS = 25;

interface MenuRowProps {
  /** Shown before the label: an outline icon of `OutlineIcons`, 22 pt. */
  icon: ReactNode;
  label: string;
  onPress: () => void;
  testID: string;
}

/**
 * A row of the Profile menu (approved Tier 3 preview, Figma 921:13989 shadow):
 * a white pill with an icon, a label and a chevron pointing at what it opens.
 */
export function MenuRow({ icon, label, onPress, testID }: MenuRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      {icon}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <ChevronRightIcon color={colors.textMuted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: ROW_RADIUS,
    backgroundColor: colors.white,
    boxShadow: menuRowShadow,
  },
  pressed: { backgroundColor: colors.surface },
  label: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.note, lineHeight: 19, color: colors.black },
});
