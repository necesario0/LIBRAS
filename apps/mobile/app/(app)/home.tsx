import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useMember } from "../../src/auth/AuthContext";
import { BookIllustration } from "../../src/components/BookIllustration";
import { Button } from "../../src/components/Button";
import { Wordmark } from "../../src/components/Wordmark";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * A minimal landing screen for a signed-in Member. There is no Figma frame for
 * it: it only proves the Member got in. The home screen ticket replaces this
 * file (search bar, Loans and Holds summary, Digital ID entry) and keeps a way
 * to sign out reachable.
 */
export default function HomeScreen() {
  const member = useMember();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();

  return (
    <View style={[styles.screen, { paddingTop: screenTop + 18, paddingBottom: insets.bottom + 25 }]}>
      <Wordmark />
      <View style={styles.book}>
        <BookIllustration width={173} height={117} />
      </View>
      <Text style={styles.title} accessibilityRole="header" testID="home-title">
        {`Welcome, ${member.firstName}!`}
      </Text>
      <Text style={styles.message} testID="home-email">
        {member.email}
      </Text>
      <View style={styles.action}>
        <Button label="Sign out" tone="muted" radius={radii.formButton} onPress={() => void signOut()} testID="home-sign-out" />
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
  },
  action: { alignSelf: "stretch", marginTop: "auto", paddingHorizontal: spacing.sm },
});
