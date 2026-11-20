import { Pressable, StyleSheet, Text } from "react-native";
import { SavedFilledIcon, SavedTabIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/**
 * Save, at the top of the Book page (approved Tier 3 preview): a white pill
 * with an outlined bookmark; once saved it is yellow with a black outline and a
 * filled bookmark and reads Saved. Pressing it toggles.
 */
export function SaveButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? "Saved. Remove from Saved books" : "Save this Book"}
      onPress={onPress}
      style={[styles.button, saved && styles.on]}
      testID="book-save"
    >
      {saved ? <SavedFilledIcon color={colors.black} size={18} /> : <SavedTabIcon color={colors.black} size={18} />}
      <Text style={styles.label} testID="book-save-label">
        {saved ? "Saved" : "Save"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pillButton,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.white,
  },
  on: { backgroundColor: colors.accent, borderColor: colors.black },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.black },
});
