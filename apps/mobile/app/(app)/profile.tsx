import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCOUNT_TYPE_LABELS } from "@libras/shared";
import { useAuth, useMember } from "../../src/auth/AuthContext";
import { Avatar } from "../../src/components/Avatar";
import { ChevronBackIcon } from "../../src/components/icons";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

const AVATAR = 84;
const BACK = 42;
/** The design puts the menu button (not built yet) beside the back button; its slot is kept empty so the back button stays where the design has it. */
const MENU_SLOT = 42 + 11 + 24;

/**
 * The Profile account screen: the Figma "Profile" frame (node 572:1468) cut down
 * to what is built. It shows who is signed in - name, email and Account Type -
 * and Sign out, which lives here and nowhere else. Left out until they exist:
 * the barcode panel (the Digital ID has its own screen), and the Saved books,
 * Borrowing history, Fines and Help rows.
 *
 * The design puts Change password on a separate "My Account" frame (node
 * 580:1742, reached from the "My account" row, next to Full name, Student ID,
 * Email and Google account). That frame is not built, so Change password joins
 * this screen as a row in the style of the menu rows, between the identity and
 * Sign out, and so does the Clearance status.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const member = useMember();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const name = [member.firstName, member.middleName, member.lastName].filter((part) => part !== undefined && part !== "").join(" ");

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Profile
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={8} style={styles.back} testID="profile-back">
          <ChevronBackIcon />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar size={AVATAR} />
          <View style={styles.details}>
            <Text style={styles.name} testID="profile-name">
              {name.toUpperCase()}
            </Text>
            <View style={styles.facts}>
              <Text style={styles.fact} testID="profile-email">
                {member.email}
              </Text>
              <Text style={styles.fact} testID="profile-account-type">
                {ACCOUNT_TYPE_LABELS[member.accountType]}
              </Text>
            </View>
          </View>
        </View>

        {/* Change password (#34) and the Clearance status (#38) go here, above Sign out. */}

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut} testID="profile-sign-out">
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: spacing.home, paddingRight: MENU_SLOT },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: fontSize.heading, color: colors.black },
  back: { width: BACK, height: BACK, borderRadius: BACK / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  content: { paddingTop: spacing.xl - 6, gap: spacing.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.home },
  details: { flex: 1, gap: spacing.xs },
  name: { fontFamily: fontFamily.regular, fontSize: fontSize.large, letterSpacing: -1.44, lineHeight: 30, color: colors.black },
  facts: { gap: spacing.sm },
  fact: { fontFamily: fontFamily.regular, fontSize: fontSize.small, letterSpacing: -0.78, lineHeight: 16, color: colors.textMuted },
  signOut: {
    marginHorizontal: spacing.screen,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.accountButton,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.96, lineHeight: fontSize.body, color: colors.error },
});
