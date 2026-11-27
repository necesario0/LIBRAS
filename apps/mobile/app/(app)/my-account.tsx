import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCOUNT_TYPE_LABELS, memberFullName } from "@libras/shared";
import { ReadOnlyField } from "../../src/account/ReadOnlyField";
import { useMember } from "../../src/auth/AuthContext";
import { Avatar } from "../../src/components/Avatar";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { colors, spacing } from "../../src/theme/tokens";

const AVATAR = 105;

/**
 * My Account: the Figma "My Account" frame (node 580:1742), cut down to what is
 * built. The avatar and the Member's full name, email and Account Type, none of
 * which can be changed here (the design's third field is the Student ID,
 * "cannot be changed"; the Account Type is fixed at sign-up too). It is pushed
 * from the "My account" row of Profile, with back at the top left as on every
 * pushed screen (approved Tier 3 preview).
 *
 * Not built, so left out: Edit Photo, editable fields with Cancel and Save
 * changes, the Student ID and Google account. Change password is a row of
 * Profile, next to My account.
 */
export default function MyAccountScreen() {
  const member = useMember();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <PushedHeader title="My Account" testID="my-account-back" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Avatar size={AVATAR} name={member} />
        </View>
        <View style={styles.fields}>
          <ReadOnlyField label="Full name" value={memberFullName(member)} testID="my-account-name" />
          <ReadOnlyField label="Email" value={member.email} testID="my-account-email" />
          <ReadOnlyField label="Account Type (cannot be changed)" value={ACCOUNT_TYPE_LABELS[member.accountType]} testID="my-account-account-type" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingTop: spacing.xl, gap: spacing.xl },
  avatar: { alignItems: "center" },
  fields: { paddingHorizontal: spacing.screen, gap: spacing.lg },
});
