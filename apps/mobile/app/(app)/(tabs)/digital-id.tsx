import { useIsFocused, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ACCOUNT_TYPE_LABELS, formatDigitalId, memberFullName } from "@libras/shared";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { ClockIcon, SunIcon } from "../../../src/components/OutlineIcons";
import { Barcode } from "../../../src/digital-id/Barcode";
import { useBrightScreen } from "../../../src/digital-id/useBrightScreen";
import { useDigitalId, useSecondsLeft } from "../../../src/digital-id/useDigitalId";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useNewLoan } from "../../../src/loans/useLoans";
import { useMyBooks } from "../../../src/my-books/MyBooksContext";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { colors, fontFamily, fontSize, radii, spacing } from "../../../src/theme/tokens";

/** The widest the barcode may be, quiet zones included. */
const BARCODE_MAX_WIDTH = 294;
const BARCODE_HEIGHT = 96;
/** What the dashed frame takes from the screen's width: the screen gutters, its 2 pt border and its 16 pt padding. */
const FRAME_INSET = 2 * spacing.home + 2 * 2 + 2 * spacing.lg;

function minutesSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The Digital ID tab. The code is fetched, the screen lit and the desk watched
 * only while the tab is in focus: leaving the tab (or opening a screen over it)
 * gives the phone its brightness and screen timeout back.
 */
export default function DigitalIdTab() {
  const focused = useIsFocused();
  return <View style={styles.screen}>{focused ? <DigitalId /> : null}</View>;
}

/**
 * The Member's Digital ID, laid out as the approved Tier 3 preview (Figma
 * "Show this to the librarian", 617:3265): a Code 128 barcode with the same
 * code printed beneath it, replaced by itself every 60 seconds, and whose it
 * is. The screen stays awake at full brightness while it shows
 * (`useBrightScreen`).
 *
 * While it is open the screen watches for a Loan: when the Librarian confirms
 * one at the desk (a Book borrowed, or a ready Hold picked up), "Successfully
 * Borrowed" opens over it.
 */
function DigitalId() {
  const router = useRouter();
  const member = useMember();
  const { request } = useAuth();
  const { canBorrow } = useMyBooks();
  const { width } = useWindowDimensions();
  const screenTop = useScreenTop();
  const tabBarSpace = useTabBarSpace();
  const { state, retry } = useDigitalId();
  const secondsLeft = useSecondsLeft(state);
  useBrightScreen();
  useNewLoan(request, (loan) => router.push({ pathname: "/borrowed", params: { loanId: loan.id } }));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: screenTop, paddingBottom: tabBarSpace }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title} accessibilityRole="header">
        {"Show this to the "}
        <Text style={styles.highlight}>librarian</Text>
      </Text>
      <Text style={styles.subtitle}>
        {canBorrow === false
          ? "Show it at the desk when you visit the library."
          : "The librarian scans it to lend you a Book or to give you the Copy set aside for your Hold."}
      </Text>

      <View style={styles.ticket} testID="digital-id-ticket">
        {state.status === "ready" && (
          <>
            <Barcode
              digits={state.id.code}
              maxWidth={Math.min(BARCODE_MAX_WIDTH, width - FRAME_INSET)}
              height={BARCODE_HEIGHT}
              testID="digital-id-barcode"
            />
            <Text style={styles.code} testID="digital-id-code" accessibilityLabel={`Code ${state.id.code.split("").join(" ")}`}>
              {formatDigitalId(state.id.code)}
            </Text>
          </>
        )}
        {state.status === "loading" && <ActivityIndicator color={colors.primary} size="large" testID="digital-id-loading" />}
        {state.status === "error" && (
          <View style={styles.failure}>
            <Text style={styles.failureText} testID="digital-id-error">
              {state.message}
            </Text>
            <Pressable accessibilityRole="button" onPress={retry} testID="digital-id-retry" hitSlop={8}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        )}
        {secondsLeft !== undefined && (
          <View style={styles.countdown}>
            <ClockIcon color={colors.textBody} size={16} />
            <Text style={styles.countdownText} testID="digital-id-countdown">
              {"New code in "}
              <Text style={styles.countdownTime}>{minutesSeconds(secondsLeft)}</Text>
            </Text>
          </View>
        )}
      </View>

      <View style={styles.who}>
        <Text style={styles.whoName} testID="digital-id-name">
          {memberFullName(member)}
        </Text>
        <Text style={styles.whoType}>{ACCOUNT_TYPE_LABELS[member.accountType]}</Text>
      </View>

      <View style={styles.bright} testID="digital-id-bright">
        <SunIcon color={colors.textMuted} size={18} />
        <Text style={styles.brightText}>Your screen is at full brightness and stays on while this is open.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingHorizontal: spacing.home },
  title: { marginTop: 14, fontFamily: fontFamily.regular, fontSize: fontSize.idHeading, letterSpacing: -1.6, lineHeight: 38, color: colors.black },
  highlight: { color: colors.highlight },
  subtitle: { marginTop: 6, fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 18, color: colors.textBody },
  ticket: {
    marginTop: 22,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: spacing.lg,
    minHeight: 186,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.ticket,
  },
  code: { fontFamily: fontFamily.mono, fontSize: fontSize.note, letterSpacing: 2.7, lineHeight: 20, color: colors.black },
  countdown: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countdownText: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 17, color: colors.textBody },
  countdownTime: { fontFamily: fontFamily.semiBold, color: colors.black },
  failure: { alignItems: "center", gap: spacing.md },
  failureText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 19, color: colors.danger, textAlign: "center" },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, lineHeight: 19, color: colors.primary },
  who: { marginTop: 18, alignItems: "center" },
  whoName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, letterSpacing: -0.4, lineHeight: 21, color: colors.black },
  whoType: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 17, color: colors.black },
  bright: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.inset,
    paddingHorizontal: spacing.md,
    borderRadius: radii.panel,
    backgroundColor: colors.surface,
  },
  brightText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.textMuted },
});
