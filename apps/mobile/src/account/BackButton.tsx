import { Pressable, StyleSheet } from "react-native";
import { ChevronBackIcon } from "../components/icons";
import { colors } from "../theme/tokens";

const SIZE = 42;

/** The yellow round back button of the Profile and My Account frames (Figma 574:1627, 580:1753). */
export function BackButton({ onPress, testID }: { onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={8} style={styles.button} testID={testID}>
      <ChevronBackIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
