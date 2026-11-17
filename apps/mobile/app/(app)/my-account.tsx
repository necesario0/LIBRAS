import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCOUNT_TYPE_LABELS, memberFullName } from "@libras/shared";
import { BackButton } from "../../src/account/BackButton";
import { ReadOnlyField } from "../../src/account/ReadOnlyField";
import { useMember } from "../../src/auth/AuthContext";
import { Avatar } from "../../src/components/Avatar";
import { useGoBack } from "../../src/hooks/useGoBack";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { colors, fontFamily, fontSize, spacing } from "../../src/theme/tokens";

const AVATAR = 105;
/** The design starts My Account's title row 20 pt below the Profile frame's. */
const HEADER_OFFSET = 20;
const HEADER_HEIGHT = 42;

/**
 * My Account: the Figma "My Account" frame (node 580:1742), cut down to what is
 * built. The avatar and the Member's full name, email and Account Type, none of
 * which can be changed here (the design's third field is the Student ID,
 * "cannot be changed"; the Account Type is fixed at sign-up too). It is opened
 * from the "My account" row of Profile.
 *
 * Not built, so left out: Edit Photo, editable fields with Cancel and Save
 * changes, the Student ID and Google account. Change password (ticket #34) goes
 * under the fields, as the design has it: a row between Email and the buttons.
 */
export default function MyAccountScreen() {
  const member = useMember();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const back = useGoBack();

  return (
    <View style={[styles.screen, { paddingTop: screenTop + HEADER_OFFSET }]}>
      <View style={styles.header}>
        <View style={styles.back}>
          <BackButton onPress={back} testID="my-account-back" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          My Account
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Avatar size={AVATAR} />
        </View>
        <View style={styles.fields}>
          <ReadOnlyField label="Full name" value={memberFullName(member)} testID="my-account-name" />
          <ReadOnlyField label="Email" value={member.email} testID="my-account-email" />
          <ReadOnlyField label="Account Type (cannot be changed)" value={ACCOUNT_TYPE_LABELS[member.accountType]} testID="my-account-account-type" />
          {/* Change password (#34) goes here, below the fields. */}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { alignItems: "center", justifyContent: "center", minHeight: HEADER_HEIGHT },
  back: { position: "absolute", left: spacing.screen },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: fontSize.heading, color: colors.black },
  content: { paddingTop: spacing.lg, gap: spacing.xl },
  avatar: { alignItems: "center" },
  fields: { paddingHorizontal: spacing.screen, gap: spacing.lg },
});
