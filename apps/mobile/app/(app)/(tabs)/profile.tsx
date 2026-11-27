import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ACCOUNT_TYPE_LABELS, memberFullName } from "@libras/shared";
import { MenuRow } from "../../../src/account/MenuRow";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { ClearancePanel } from "../../../src/clearance/ClearancePanel";
import { useClearance } from "../../../src/clearance/useClearance";
import { Avatar } from "../../../src/components/Avatar";
import { GearIcon, HelpIcon, KeyIcon, PersonOutlineIcon } from "../../../src/components/OutlineIcons";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../../../src/theme/tokens";

const AVATAR = 70;
const ROW_ICON = 22;

/**
 * The Profile tab, laid out as the approved Tier 3 preview (style from the
 * Figma "Profile" frame, node 572:1468): the Member's avatar, name, email and
 * Account Type, then the rows My account, Clearance (`ClearancePanel`: whether
 * the Member is cleared, the Loans still out and the unsettled Fines) and
 * Change password, then Sign out, which lives only here.
 *
 * Then Settings and Help and policies.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const member = useMember();
  const { request, signOut } = useAuth();
  const { state: clearance, reload: reloadClearance } = useClearance(request);
  const screenTop = useScreenTop();
  const tabBarSpace = useTabBarSpace();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: screenTop, paddingBottom: tabBarSpace }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>

      <View style={styles.identity}>
        <Avatar size={AVATAR} name={member} />
        <View style={styles.details}>
          <Text style={styles.name} testID="profile-name">
            {memberFullName(member)}
          </Text>
          <Text style={styles.fact} testID="profile-email">
            {member.email}
          </Text>
          <Text style={styles.fact} testID="profile-account-type">
            {ACCOUNT_TYPE_LABELS[member.accountType]}
          </Text>
        </View>
      </View>

      <View style={styles.menu}>
        <MenuRow
          icon={<PersonOutlineIcon color={colors.black} size={ROW_ICON} />}
          label="My account"
          onPress={() => router.push("/my-account")}
          testID="profile-my-account"
        />
        <ClearancePanel state={clearance} onRetry={() => void reloadClearance()} />
        <MenuRow
          icon={<KeyIcon color={colors.black} size={ROW_ICON} />}
          label="Change password"
          onPress={() => router.push("/change-password")}
          testID="profile-change-password"
        />
        <MenuRow
          icon={<GearIcon color={colors.black} size={ROW_ICON} />}
          label="Settings"
          onPress={() => router.push("/settings")}
          testID="profile-settings"
        />
        <MenuRow
          icon={<HelpIcon color={colors.black} size={ROW_ICON} />}
          label="Help and policies"
          onPress={() => router.push("/help")}
          testID="profile-help"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        testID="profile-sign-out"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingHorizontal: spacing.home },
  title: { marginTop: 10, fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: lineHeightFor(fontSize.heading), color: colors.black },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.inset, marginTop: 18 },
  details: { flex: 1, gap: 2 },
  name: { fontFamily: fontFamily.regular, fontSize: fontSize.name, letterSpacing: -1.3, lineHeight: lineHeightFor(fontSize.name), color: colors.black },
  fact: { fontFamily: fontFamily.regular, fontSize: fontSize.small, letterSpacing: -0.4, lineHeight: lineHeightFor(fontSize.small), color: colors.textMuted },
  menu: { marginTop: 22, marginHorizontal: 6, gap: 14 },
  signOut: {
    marginTop: 22,
    marginHorizontal: 6,
    padding: spacing.inset,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.actionButton,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surface },
  signOutLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), color: colors.error },
});
