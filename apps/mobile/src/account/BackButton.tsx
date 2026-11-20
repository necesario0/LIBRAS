import { Pressable, StyleSheet } from "react-native";
import { ChevronBackIcon } from "../components/icons";
import { colors } from "../theme/tokens";

export const BACK_BUTTON_SIZE = 42;

/** The yellow round back button of the Profile and My Account frames (Figma 574:1627, 580:1753). */
export function BackButton({ onPress, testID }: { onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={8} style={styles.button} testID={testID}>
      <ChevronBackIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: BACK_BUTTON_SIZE, height: BACK_BUTTON_SIZE, borderRadius: BACK_BUTTON_SIZE / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
