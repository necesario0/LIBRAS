import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronBackIcon } from "../src/components/icons";
import { colors, fontFamily, fontSize, spacing } from "../src/theme/tokens";

const SECTIONS = [
  {
    title: "Consumer Terms",
    body: "LIBRAS is the University of Makati library system. You use it to find books, see whether a copy is available, and keep track of what you borrowed. Give true information when you sign up, and keep your password to yourself. Your account belongs to you alone.",
  },
  {
    title: "Usage Policy",
    body: "Borrowing happens at the library desk: the Librarian scans your Digital ID and the copy. Your Account Type decides how many copies you may borrow and for how long. Do not share your Digital ID, and do not try to reach other Members' records.",
  },
  {
    title: "Privacy policy",
    body: "The library keeps the details you give at sign-up, such as your name, student number and email, and your borrowing records. They are visible to you and to library staff on duty, and are used only to run the library.",
  },
] as const;

/**
 * The terms a Member accepts at sign-up. The wording is a short draft until the
 * University Library supplies the approved text.
 */
export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={styles.back}
        testID="terms-back"
      >
        <ChevronBackIcon />
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Terms and policies
        </Text>
        <Text style={styles.draft}>Draft wording, pending approval by the University Library.</Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  back: { paddingHorizontal: spacing.screen, paddingVertical: spacing.sm, alignSelf: "flex-start" },
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xxl, gap: spacing.xl },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.heading, color: colors.black },
  draft: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.textMuted, marginTop: -spacing.md },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, lineHeight: 21 },
});
