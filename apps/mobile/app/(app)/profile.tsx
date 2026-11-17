import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCOUNT_TYPE_LABELS, memberFullName } from "@libras/shared";
import { BackButton } from "../../src/account/BackButton";
import { MenuRow } from "../../src/account/MenuRow";
import { useAuth, useMember } from "../../src/auth/AuthContext";
import { Avatar } from "../../src/components/Avatar";
import { PersonIcon } from "../../src/components/icons";
import { useGoBack } from "../../src/hooks/useGoBack";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

const AVATAR = 84;

/**
 * The Profile screen: the Figma "Profile" frame (node 572:1468), cut down to
 * what is built. The Member's avatar, name, email and Account Type sit at the
 * top (the design's third line, the ID number, shows the Account Type here),
 * then the menu, which has one row, "My account" (opens `my-account.tsx`), and
 * Sign out, which is only here.
 *
 * Not built, so left out of the menu: Saved books, Borrowing history, Fines and
 * Help, the barcode panel (the Digital ID has its own screen) and the menu
 * button beside the back button. The Clearance status (ticket #38) goes in the
 * menu where the design has its Fines row.
 *
 * The design's button says "Log out" and its rows are 30 pt from the left edge
 * and 26 from the right; this screen says "Sign out", as the rest of the app
 * does, and uses the symmetric `spacing.screen`.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const member = useMember();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const back = useGoBack();

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Profile
        </Text>
        <BackButton onPress={back} testID="profile-back" />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar size={AVATAR} />
          <View style={styles.details}>
            <Text style={styles.name} testID="profile-name">
              {memberFullName(member).toUpperCase()}
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

        <View style={styles.menu}>
          <MenuRow icon={<PersonIcon />} label="My account" onPress={() => router.push("/my-account")} testID="profile-my-account" />
        </View>

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut} testID="profile-sign-out">
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.home },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: fontSize.heading, color: colors.black },
  content: { paddingTop: spacing.lg, gap: spacing.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.inset, paddingHorizontal: spacing.home },
  details: { flex: 1, gap: spacing.xs },
  name: { fontFamily: fontFamily.regular, fontSize: fontSize.large, letterSpacing: -1.44, lineHeight: 30, color: colors.black },
  facts: { gap: spacing.sm },
  fact: { fontFamily: fontFamily.regular, fontSize: fontSize.small, letterSpacing: -0.78, lineHeight: 16, color: colors.textMuted },
  menu: { marginHorizontal: spacing.screen, marginTop: spacing.sm },
  signOut: {
    marginHorizontal: spacing.screen,
    padding: spacing.inset,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.actionButton,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.96, lineHeight: fontSize.body, color: colors.error },
});
