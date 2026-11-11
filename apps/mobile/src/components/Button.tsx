import { Pressable, StyleSheet, Text } from "react-native";
import { colors, controlHeight, radii, typography } from "../theme/tokens";

interface ButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

/** The primary pill button (Figma "Continue"). */
export function Button({ label, onPress, testID }: ButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.button}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: controlHeight,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  label: { ...typography.body, color: colors.white },
});
