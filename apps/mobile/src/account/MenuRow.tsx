import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronBackIcon } from "../components/icons";
import { colors, fontFamily, fontSize, menuRowShadow, radii, spacing } from "../theme/tokens";

/**
 * A row of the Profile menu (Figma 921:13989): a white pill with a shadow, an
 * icon and a label on the left and a chevron pointing at what it opens.
 */
export function MenuRow({ icon, label, onPress, testID }: { icon: ReactNode; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row} testID={testID}>
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
  start: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.96, lineHeight: 16, color: colors.black },
  chevron: { ...CHEVRON, alignItems: "center", justifyContent: "center" },
});
