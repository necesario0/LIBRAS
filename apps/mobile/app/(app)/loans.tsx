import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isCurrentLoan } from "@libras/shared";
import { useAuth } from "../../src/auth/AuthContext";
import { Button } from "../../src/components/Button";
import { ChevronBackIcon } from "../../src/components/icons";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { LoanRow } from "../../src/loans/LoanRow";
import { useLoans } from "../../src/loans/useLoans";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * My Loans: the Copies the Member has out, each with the day it was checked out
 * and the day it is due, overdue ones marked, and under them their past Loans:
 * the ones that have been returned, each with the day it came back. There is no Figma frame for it: it uses the style of
 * Home, the Book page and the Holds screen.
 */
export default function LoansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const { request } = useAuth();
  const { state, reload } = useLoans(request);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  const current = state.status === "loaded" ? state.loans.filter(isCurrentLoan) : [];
  const past = state.status === "loaded" ? state.loans.filter((loan) => !isCurrentLoan(loan)) : [];
  const overdue = current.filter((loan) => loan.overdue).length;

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12} style={styles.back} testID="loans-back">
          <ChevronBackIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          My Loans
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="loans-loading" /> : null}

        {state.status === "error" ? (
          <View style={[styles.panel, styles.failed]} testID="loans-error">
            <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
              Your Loans did not load
            </Text>
            <Text style={styles.panelBody}>{state.message}</Text>
            <Button label="Try again" radius={radii.formButton} onPress={() => void reload()} testID="loans-retry" />
          </View>
        ) : null}

        {state.status === "loaded" && state.loans.length === 0 ? (
          <View style={styles.panel} testID="loans-empty">
            <Text style={styles.panelTitle} accessibilityRole="header">
              No Loans yet
            </Text>
            <Text style={styles.panelBody}>
              {state.loanLimit > 0
                ? "Open a Book with an available Copy and tap Borrow, then show your Digital ID to the librarian. The Copies you take home are listed here."
                : "Your Account Type cannot borrow. You can still see which Copies are available and read them in the library."}
            </Text>
          </View>
        ) : null}

        {overdue > 0 ? (
          <View style={[styles.panel, styles.failed]} testID="loans-overdue-notice">
            <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
              {overdue === 1 ? "1 Loan is overdue" : `${overdue} Loans are overdue`}
            </Text>
            <Text style={styles.notice}>
              {`Please return ${overdue === 1 ? "it" : "them"} to the library desk as soon as you can.`}
            </Text>
          </View>
        ) : null}

        {current.length > 0 ? (
          <View testID="loans-current">
            <Text style={styles.section} testID="loans-current-count">
              {state.status === "loaded" && state.loanLimit > 0 ? `Current - ${current.length} of ${state.loanLimit}` : "Current"}
            </Text>
            {current.map((loan) => (
              <LoanRow key={loan.id} loan={loan} />
            ))}
          </View>
        ) : null}

        {current.length === 0 && past.length > 0 ? (
          <View style={styles.panel} testID="loans-none-current">
            <Text style={styles.panelTitle} accessibilityRole="header">
              No current Loans
            </Text>
            <Text style={styles.notice}>Nothing is out on your account right now. The Copies you have returned are listed below.</Text>
          </View>
        ) : null}

        {past.length > 0 ? (
          <View testID="loans-past">
            <Text style={styles.section} testID="loans-past-count">{`Past Loans - ${past.length}`}</Text>
            {past.map((loan) => (
              <LoanRow key={loan.id} loan={loan} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.home, paddingTop: 2 },
  back: { width: 40, height: 40, borderRadius: radii.button, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.title, letterSpacing: -1, color: colors.black },
  body: { flex: 1, marginTop: spacing.lg },
  content: { paddingHorizontal: spacing.home, gap: spacing.lg },
  spinner: { marginTop: spacing.xl },
  section: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.textMuted },
  panel: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  failed: { borderColor: colors.error },
  panelTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  panelBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
  notice: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary },
});
