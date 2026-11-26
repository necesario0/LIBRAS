import { useIsFocused, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ACCOUNT_TYPE_LABELS, memberFullName } from "@libras/shared";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { useClearance } from "../../../src/clearance/useClearance";
import { SunIcon } from "../../../src/components/OutlineIcons";
import { DigitalIdTicket, TICKET_INSET } from "../../../src/digital-id/DigitalIdTicket";
import { useBrightScreen } from "../../../src/digital-id/useBrightScreen";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useNewLoan } from "../../../src/loans/useLoans";
import { useMyBooks } from "../../../src/my-books/MyBooksContext";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { StandingNotice } from "../../../src/standing/StandingNotice";
import { colors, fontFamily, fontSize, radii, spacing } from "../../../src/theme/tokens";

/** The widest the barcode may be, quiet zones included. */
const BARCODE_MAX_WIDTH = 294;
/** What the dashed frame takes from the screen's width: the screen gutters, then its own border and padding. */
const FRAME_INSET = 2 * spacing.home + TICKET_INSET;

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
 *
 * A Member who is not in Good standing reads so above the code (the same
 * `StandingNotice` as Home and the Book page), and the line under the heading
 * says what the code is still good for at the desk: returning a Copy and
 * settling a Fine.
 */
function DigitalId() {
  const router = useRouter();
  const member = useMember();
  const { request } = useAuth();
  const { canBorrow, inLibraryOnly } = useMyBooks();
  const { state: clearance } = useClearance(request);
  const standing = clearance.status === "loaded" ? clearance.goodStanding : undefined;
  const blocked = standing !== undefined && !standing.inGoodStanding ? standing : undefined;
  const { width } = useWindowDimensions();
  const screenTop = useScreenTop();
  const tabBarSpace = useTabBarSpace();
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
          : blocked
            ? "The librarian scans it to take back a Copy or to settle a Fine."
          : inLibraryOnly
            ? "The librarian scans it at the desk to lend you a Book for same-day in-library use during library hours."
            : "The librarian scans it to lend you a Book or to give you the Copy set aside for your Hold."}
      </Text>

      {blocked ? (
        <View style={styles.notice}>
          <StandingNotice title="The librarian can’t lend you a Book today" reasons={blocked.reasons} from="tab" testID="digital-id-standing" />
        </View>
      ) : null}

      <View style={styles.ticket}>
        <DigitalIdTicket barcodeWidth={Math.min(BARCODE_MAX_WIDTH, width - FRAME_INSET)} testID="digital-id" />
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
  notice: { marginTop: 18 },
  ticket: { marginTop: 22 },
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
