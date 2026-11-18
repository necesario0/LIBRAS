import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { counted, formatLibraryDate, formatPesos, goodStandingNotice, plural } from "@libras/shared";
import type { Clearance, GoodStanding } from "@libras/shared";
import { DollarSignIcon } from "../components/icons";
import { StatusPill } from "../components/StatusPill";
import type { PillTone } from "../components/StatusPill";
import { colors, fontFamily, fontSize, menuRowShadow, radii, spacing } from "../theme/tokens";
import type { ClearanceState } from "./useClearance";

interface ClearancePanelProps {
  state: ClearanceState;
  onRetry: () => void;
}

interface LineProps {
  testID: string;
  title: string;
  note: string;
  /** The note in red: the Loan is overdue. */
  alert?: boolean;
  /** What is owed, on the right: a Fine has one, a Loan does not. */
  amountCentavos?: number;
}

/** One Loan still out or one unsettled Fine: the Book, then the Copy and the dates, with the amount for a Fine. */
function Line({ testID, title, note, alert = false, amountCentavos }: LineProps) {
  return (
    <View style={styles.line} testID={testID}>
      <View style={styles.lineText}>
        <Text style={styles.lineTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.lineNote, alert && styles.overdue]}>{note}</Text>
      </View>
      {amountCentavos === undefined ? null : <Text style={styles.amount}>{formatPesos(amountCentavos)}</Text>}
    </View>
  );
}

function Blockers({ clearance, goodStanding }: { clearance: Clearance; goodStanding: GoodStanding }) {
  const { loansOut, unsettledFines } = clearance;
  return (
    <View style={styles.details}>
      {goodStanding.inGoodStanding ? null : (
        <Text style={styles.standing} accessibilityRole="alert" testID="profile-good-standing">
          {goodStandingNotice(goodStanding.reasons)}
        </Text>
      )}
      <Text style={styles.note}>To be cleared, return your Loans and settle your Fines at the library desk.</Text>
      {loansOut.length > 0 ? (
        <View style={styles.group} testID="profile-clearance-loans">
          <Text style={styles.groupTitle}>{`${plural(loansOut.length, "Loan")} still out`}</Text>
          {loansOut.map((loan) => (
            <Line
              key={loan.loanId}
              testID={`profile-clearance-loan-${loan.loanId}`}
              title={loan.bookTitle}
              note={`Copy ${loan.accessionNumber} - ${loan.overdue ? "overdue, was due" : "due"} ${formatLibraryDate(loan.dueAt)}`}
              alert={loan.overdue}
            />
          ))}
        </View>
      ) : null}
      {unsettledFines.length > 0 ? (
        <View style={styles.group} testID="profile-clearance-fines">
          <Text style={styles.groupTitle}>{`Unsettled ${plural(unsettledFines.length, "Fine")}`}</Text>
          {unsettledFines.map((fine) => (
            <Line
              key={fine.loanId}
              testID={`profile-clearance-fine-${fine.loanId}`}
              title={fine.bookTitle}
              note={`Copy ${fine.accessionNumber} - ${counted(fine.daysLate, "day")} late, returned ${formatLibraryDate(fine.returnedAt)}`}
              amountCentavos={fine.amountCentavos}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Clearance on Profile: whether the Member is cleared, and when not, the Loans
 * still out and the unsettled Fines in the way. It sits where the Figma
 * Profile frame has its "Fines" row (node 921:14028): the same white pill with
 * the dollar sign and a 16 pt label, with the status where the design has the
 * chevron, and the details below inside the same card. A Member who is not in
 * Good standing (which only a Member who is not cleared can be) reads first why
 * they cannot borrow, place a Hold or renew. The API works both out; this only
 * shows them.
 */
export function ClearancePanel({ state, onRetry }: ClearancePanelProps) {
  const loaded = state.status === "loaded" ? state : undefined;
  const clearance = loaded?.clearance;
  const pill: { label: string; tone: PillTone } | undefined =
    clearance === undefined
      ? undefined
      : clearance.cleared
        ? { label: "Cleared", tone: "available" }
        : { label: "Not cleared", tone: "danger" };

  return (
    <View style={styles.card} testID="profile-clearance">
      <View style={styles.header}>
        <View style={styles.title}>
          <DollarSignIcon />
          <Text style={styles.label}>Clearance</Text>
        </View>
        {pill === undefined ? null : (
          <StatusPill
            label={pill.label}
            tone={pill.tone}
            size={fontSize.caption}
            style={styles.pill}
            testID="profile-clearance-status"
          />
        )}
      </View>

      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="profile-clearance-loading" /> : null}

      {state.status === "error" ? (
        <View style={styles.details} testID="profile-clearance-error">
          <Text style={styles.note} accessibilityRole="alert">
            {state.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry} testID="profile-clearance-retry">
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {loaded === undefined ? null : loaded.clearance.cleared ? (
        <View style={styles.details}>
          <Text style={styles.note} testID="profile-clearance-note">
            You have no Loans out and no unsettled Fines.
          </Text>
        </View>
      ) : (
        <Blockers clearance={loaded.clearance} goodStanding={loaded.goodStanding} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, backgroundColor: colors.white, boxShadow: menuRowShadow, padding: spacing.inset, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flexDirection: "row", alignItems: "center" },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.96, lineHeight: 16, color: colors.black },
  pill: { marginRight: spacing.xs },
  spinner: { alignSelf: "center", paddingBottom: spacing.sm },
  details: { gap: spacing.md, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  standing: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    lineHeight: 18,
    color: colors.danger,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.panel,
    padding: spacing.md,
  },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textSecondary },
  group: { gap: spacing.sm },
  groupTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.caption, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textMuted },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  lineText: { flex: 1, gap: 2 },
  lineTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  lineNote: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  overdue: { fontFamily: fontFamily.semiBold, color: colors.danger },
  amount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, color: colors.danger },
  retry: {
    alignSelf: "flex-start",
    height: 36,
    borderRadius: radii.button,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  retryLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, color: colors.black },
});
