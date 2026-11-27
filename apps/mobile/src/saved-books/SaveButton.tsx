import { Pressable, StyleSheet, Text, View } from "react-native";
import { SavedFilledIcon, SavedTabIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, lineHeightFor, minTouchTarget, radii, spacing } from "../theme/tokens";

/** The pill's drawn height; the tap around it is `minTouchTarget`. */
const HEIGHT = 38;

/**
 * Save, at the top of the Book page (approved Tier 3 preview): a white pill
 * with an outlined bookmark; once saved it is yellow with a black outline and a
 * filled bookmark and reads Saved. Pressing it toggles. The pill is 38 pt high
 * and the tap 48: the extra spills over the row around it without moving it.
 */
export function SaveButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? "Saved. Remove from Saved books" : "Save this Book"}
      onPress={onPress}
      style={styles.target}
      testID="book-save"
    >
      <View style={[styles.button, saved && styles.on]}>
        {saved ? <SavedFilledIcon color={colors.black} size={18} /> : <SavedTabIcon color={colors.black} size={18} />}
        <Text style={styles.label} testID="book-save-label">
          {saved ? "Saved" : "Save"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { height: minTouchTarget, justifyContent: "center", marginVertical: -(minTouchTarget - HEIGHT) / 2 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pillButton,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.white,
  },
  on: { backgroundColor: colors.accent, borderColor: colors.black },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.black },
});
