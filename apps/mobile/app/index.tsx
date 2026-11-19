import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthContext";
import { useScreenTop } from "../src/hooks/useScreenTop";
import { BookIllustration } from "../src/components/BookIllustration";
import { Button } from "../src/components/Button";
import { ConsentText } from "../src/components/ConsentText";
import { Wordmark } from "../src/components/Wordmark";
import { colors, fontSize, fontFamily, radii, spacing } from "../src/theme/tokens";

/**
 * The root route. A signed-in Member who lands here (a fresh launch with a
 * stored session, or just after signing in) goes on to their home screen; the
 * navigation guard keeps the welcome and sign-in screens off the stack, so this
 * is the one place that decides where "/" leads.
 */
export default function RootScreen() {
  const { state } = useAuth();
  return state.status === "signedIn" ? <Redirect href="/home" /> : <WelcomeScreen />;
}

/**
 * The first screen (Figma "iPhone 17 - 89"): the book, the university's name
 * and SIGN UP, with "already have an account?" leading to sign-in. "continue
 * with umak email" is the passwordless sign-in, which is out of scope for Tier 1.
 */
function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const { width } = useWindowDimensions();
  const emblemWidth = Math.min(344, width - 36);
  const emblemHeight = Math.round((emblemWidth * 721) / 1181);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 7 }]}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.hero}>
          <BookIllustration width={emblemWidth} height={emblemHeight} />
          <Text style={styles.name} accessibilityRole="header">
            {"UNIVERSITY OF\nMAKATI"}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label="SIGN  UP"
            tone="accent"
            radius={radii.field}
            onPress={() => router.push("/sign-up/account-type")}
            testID="welcome-sign-up"
          />
          <Pressable
            onPress={() => router.push("/sign-in")}
            accessibilityRole="link"
            hitSlop={8}
            testID="welcome-sign-in"
          >
            <Text style={styles.signIn}>already have an account?</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 25 }]}>
        <ConsentText />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, alignItems: "center" },
  hero: { alignItems: "center", gap: 28, marginTop: 48 },
  name: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.hero,
    color: colors.black,
    textAlign: "center",
  },
  actions: { alignSelf: "stretch", alignItems: "center", paddingHorizontal: spacing.screen, marginTop: 48, gap: spacing.md },
  signIn: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.linkSubtle,
    textDecorationLine: "underline",
  },
  footer: { paddingTop: spacing.lg },
});
