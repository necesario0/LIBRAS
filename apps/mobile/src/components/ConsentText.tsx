import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { colors, fontFamily, fontSize } from "../theme/tokens";

/**
 * "By continuing, you agree to libras Consumer Terms and Usage Policy, and
 * acknowledge their Privacy policy": the line at the foot of every onboarding
 * frame. Each underlined name opens the terms.
 */
export function ConsentText() {
  const router = useRouter();
  const open = () => router.push("/terms");
  return (
    <Text style={styles.text} testID="consent-text">
      {"By continuing, you agree to libras "}
      <Text style={styles.link} accessibilityRole="link" onPress={open}>
        Consumer Terms
      </Text>
      {" and "}
      <Text style={styles.link} accessibilityRole="link" onPress={open}>
        Usage Policy
      </Text>
      {", and acknowledge their "}
      <Text style={styles.link} accessibilityRole="link" onPress={open}>
        Privacy policy
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 337,
    alignSelf: "center",
  },
  link: { color: colors.black, textDecorationLine: "underline" },
});
