import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookIllustration } from "../../src/components/BookIllustration";
import { Button } from "../../src/components/Button";
import { Wordmark } from "../../src/components/Wordmark";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * The account is active. There is no Figma frame for this moment (the design
 * goes straight to Home), so it is built in the style of the onboarding frames.
 */
export default function DoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member, reset } = useSignUp();

  function onContinue() {
    reset();
    router.dismissAll();
    router.replace("/");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 25 }]}>
      <Wordmark />
      <View style={styles.book}>
        <BookIllustration width={173} height={117} />
      </View>
      <Text style={styles.title} accessibilityRole="header" testID="done-title">
        {`Welcome, ${member?.firstName ?? "Member"}!`}
      </Text>
      <Text style={styles.message} testID="done-message">
        Your email is verified and your account is active. You can use LIBRAS right away.
      </Text>
      <View style={styles.action}>
        <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="done-continue" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, alignItems: "center", paddingHorizontal: spacing.screen },
  book: { marginTop: 17 },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.heading,
    color: colors.black,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 300,
  },
  action: { alignSelf: "stretch", marginTop: "auto", paddingHorizontal: spacing.sm },
});
