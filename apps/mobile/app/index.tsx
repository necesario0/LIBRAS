import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenTop } from "../src/hooks/useScreenTop";
import { BookIllustration } from "../src/components/BookIllustration";
import { Button } from "../src/components/Button";
import { ConsentText } from "../src/components/ConsentText";
import { Wordmark } from "../src/components/Wordmark";
import { colors, fontSize, fontFamily, radii, spacing } from "../src/theme/tokens";

/**
 * The first screen (Figma "iPhone 17 - 89"): the book, the university's name
 * and SIGN UP, with "already have an account?" leading to sign-in. "continue
 * with umak email" is the passwordless sign-in, which is out of scope for Tier 1.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 7 }]}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.hero}>
          <BookIllustration width={292} height={197} />
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
  hero: { alignItems: "center", gap: 41, marginTop: 68 + spacing.sm + 2 },
  name: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.hero,
    color: colors.black,
    textAlign: "center",
  },
  actions: { alignSelf: "stretch", alignItems: "center", paddingHorizontal: spacing.screen, marginTop: 60, gap: spacing.md },
  signIn: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.linkSubtle,
    textDecorationLine: "underline",
  },
  footer: { paddingTop: spacing.lg },
});
