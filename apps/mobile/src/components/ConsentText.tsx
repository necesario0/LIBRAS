import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { colors, fontFamily, fontSize } from "../theme/tokens";

/**
 * "By continuing, you agree to LIBRAS Consumer Terms and Usage Policy, and
 * acknowledge their Privacy policy": the line at the foot of every onboarding
 * frame (the welcome screen, sign-up and its code screens). Each underlined name
 * opens the terms. The frames write the name "libras"; here it is LIBRAS, as
 * the system is named everywhere else.
 */
export function ConsentText() {
  const router = useRouter();
  const openTerms = () => router.push({ pathname: "/terms", params: { doc: "terms" } });
  const openPrivacy = () => router.push({ pathname: "/terms", params: { doc: "privacy" } });
  return (
    <Text style={styles.text} testID="consent-text">
      {"By continuing, you agree to LIBRAS "}
      <Text style={styles.link} accessibilityRole="link" onPress={openTerms}>
        Consumer Terms
      </Text>
      {" and "}
      <Text style={styles.link} accessibilityRole="link" onPress={openTerms}>
        Usage Policy
      </Text>
      {", and acknowledge their "}
      <Text style={styles.link} accessibilityRole="link" onPress={openPrivacy}>
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
