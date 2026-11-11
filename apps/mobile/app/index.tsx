import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookIllustration } from "../src/components/BookIllustration";
import { Button } from "../src/components/Button";
import { ConsentText } from "../src/components/ConsentText";
import { Wordmark } from "../src/components/Wordmark";
import { colors, fontSize, fontFamily, radii, spacing } from "../src/theme/tokens";

/**
 * The first screen (Figma "iPhone 17 - 89"): the book, the university's name
 * and SIGN UP. "continue with umak email" is the passwordless sign-in, which is
 * out of scope for Tier 1, and "already have an account?" arrives with sign-in.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 7 }]}
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
  actions: { alignSelf: "stretch", paddingHorizontal: spacing.screen, marginTop: 60 },
  footer: { paddingTop: spacing.lg },
});
