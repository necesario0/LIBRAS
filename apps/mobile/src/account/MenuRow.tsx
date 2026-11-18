import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronBackIcon } from "../components/icons";
import { actionHeight, actionRowShadow, colors, fontFamily, fontSize, menuRowShadow, radii, spacing } from "../theme/tokens";

/**
 * Which design the row follows. `menu` is the Profile menu row (Figma
 * 921:13989): an icon and a label with a 6.5 blur shadow. `action` is the
 * action row of My Account (580:1832, "Change password"): the same pill and
 * chevron, no icon, 46 pt high, with a tighter 2 blur shadow.
 */
export type MenuRowVariant = "menu" | "action";

interface MenuRowProps {
  /** Shown before the label. The `menu` variant has one; the `action` variant does not. */
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  testID: string;
  variant?: MenuRowVariant;
}

/** A white pill with a label and a chevron pointing at what it opens. */
export function MenuRow({ icon, label, onPress, testID, variant = "menu" }: MenuRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, variant === "action" && styles.actionRow]} testID={testID}>
      <View style={styles.start}>
        {icon}
        <Text style={styles.label}>{label}</Text>
      </View>
      {/* The chevron export is the 7 by 14 stroke inside a 24 pt box: it is turned to point right and its box does not take part in the layout. */}
      <View style={styles.chevron}>
        <ChevronBackIcon rotate={180} />
      </View>
    </Pressable>
  );
}

const CHEVRON = { width: 7, height: 14 } as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.inset,
    borderRadius: radii.button,
    backgroundColor: colors.white,
    boxShadow: menuRowShadow,
  },
  actionRow: { height: actionHeight, paddingHorizontal: spacing.lg, boxShadow: actionRowShadow },
  start: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.96, lineHeight: 16, color: colors.black },
  chevron: { ...CHEVRON, alignItems: "center", justifyContent: "center" },
});
