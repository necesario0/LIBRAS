import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { loanPolicyHelp } from "@libras/shared";
import { useAuth } from "../../src/auth/AuthContext";
import { DocumentIcon, ShieldIcon } from "../../src/components/OutlineIcons";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { FactTable, SectionLabel, SettingsGroup, SettingsRow } from "../../src/settings/SettingsParts";
import { useLoanPolicy } from "../../src/settings/useLoanPolicy";
import { colors, fontFamily, fontSize, spacing } from "../../src/theme/tokens";

const ICON = 20;

/**
 * Help and policies (approved Tier 3 preview): the Member's own Loan Policy
 * read from the API and worded for their Account Type (`loanPolicyHelp`), then
 * links to the Terms and Conditions and the Privacy Policy. An Account Type
 * that cannot borrow is told so plainly and what it can do instead.
 */
export default function HelpScreen() {
  const router = useRouter();
  const { request } = useAuth();
  const { state, reload } = useLoanPolicy(request);
  const screenTop = useScreenTop();
  const help = state.status === "loaded" ? loanPolicyHelp(state) : undefined;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: screenTop }]} showsVerticalScrollIndicator={false}>
        <PushedHeader title="Help and policies" testID="help-back" />
        <View style={styles.body}>
          {state.status === "loading" ? <Text style={styles.paragraph} testID="help-loading">Loading your Loan Policy...</Text> : null}
          {state.status === "error" ? (
            <View testID="help-error">
              <Text style={styles.paragraph}>{state.message}</Text>
              <Text style={styles.retry} accessibilityRole="button" onPress={() => void reload()} testID="help-retry">
                Try again
              </Text>
            </View>
          ) : null}
          {help === undefined ? null : (
            <>
              <SectionLabel>{help.heading}</SectionLabel>
              <FactTable facts={help.facts} testID="help-policy" />
              {help.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph} testID={help.canBorrow ? "help-paragraph" : "help-cannot-borrow"}>
                  {paragraph}
                </Text>
              ))}
            </>
          )}

          <SectionLabel>Policies</SectionLabel>
          <SettingsGroup>
            <SettingsRow
              icon={<DocumentIcon color={colors.black} size={ICON} />}
              label="Terms and Conditions"
              opens
              onPress={() => router.push("/terms")}
              testID="help-terms"
            />
            <SettingsRow
              icon={<ShieldIcon color={colors.black} size={ICON} />}
              label="Privacy Policy"
              opens
              onPress={() => router.push("/terms")}
              testID="help-privacy"
            />
          </SettingsGroup>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.home, marginTop: 6 },
  paragraph: { marginTop: 12, marginHorizontal: spacing.xs, fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 20, color: colors.textBody },
  retry: { marginTop: spacing.sm, marginHorizontal: spacing.xs, fontFamily: fontFamily.semiBold, fontSize: fontSize.action, lineHeight: 18, color: colors.primary },
});
