import { Pressable, StyleSheet, Text } from "react-native";
import { callToActionHeight, colors, fontFamily, fontSize, radii } from "../theme/tokens";

interface CallToActionProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

/** The yellow call to action of the borrow flow: "Borrow" on a Book (Figma 609:1066) and "View My Books" (Figma 617:3570). */
export function CallToAction({ label, onPress, testID }: CallToActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: callToActionHeight,
    borderRadius: radii.callToAction,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.subheading, letterSpacing: -0.8, color: colors.black },
});
