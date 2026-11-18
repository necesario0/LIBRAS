import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/**
 * The small outlined button of a list row that starts an action on it (approved
 * Tier 3 preview): Renew a Loan, Cancel a Hold. `fill` is the yellow one, for
 * the action the row is waiting for: Show my Digital ID on a ready Hold.
 */
export function RowAction({ label, onPress, testID, fill = false }: { label: string; onPress: () => void; testID: string; fill?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.small, fill && styles.smallFill, pressed && styles.smallPressed]}
      testID={testID}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

/** Row actions side by side. */
export function RowActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

interface RowConfirmationProps {
  /** What is about to happen, asked once more. */
  question: ReactNode;
  /** The answer that goes ahead, its words while it runs, and its colour: blue for a gain, red for a loss. */
  confirm: { label: string; busyLabel: string; tone: "primary" | "danger"; testID: string };
  /** The answer that keeps things as they are. */
  keep: { label: string; testID: string };
  /** The action is running: both answers are disabled. */
  busy: boolean;
  onConfirm: () => void;
  onKeep: () => void;
  testID?: string;
  questionTestID?: string;
}

/**
 * The question a list row asks before it acts, with the two answers side by
 * side, in place of the row's action button (`RowAction`). My Loans asks it
 * before a Renewal, My Holds before a Hold is cancelled.
 */
export function RowConfirmation({ question, confirm, keep, busy, onConfirm, onKeep, testID, questionTestID }: RowConfirmationProps) {
  const danger = confirm.tone === "danger";
  return (
    <View style={styles.confirm} testID={testID}>
      <Text style={styles.question} testID={questionTestID}>
        {question}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onConfirm}
          style={[styles.action, danger ? styles.actionDanger : styles.actionPrimary, busy && styles.busy]}
          testID={confirm.testID}
        >
          <Text style={[styles.actionLabel, styles.actionStrongLabel]}>{busy ? confirm.busyLabel : confirm.label}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onKeep} style={[styles.action, styles.actionMuted]} testID={keep.testID}>
          <Text style={styles.actionLabel}>{keep.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The part of a question to stand out, such as the new due date. */
export function RowConfirmationEmphasis({ children }: { children: ReactNode }) {
  return <Text style={styles.emphasis}>{children}</Text>;
}

const styles = StyleSheet.create({
  confirm: { gap: spacing.sm },
  question: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textSecondary },
  emphasis: { fontFamily: fontFamily.semiBold, color: colors.black },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { height: 36, borderRadius: radii.button, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  small: {
    height: 32,
    borderRadius: radii.segment,
    borderWidth: 1,
    borderColor: colors.black,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  smallFill: { backgroundColor: colors.accent },
  smallPressed: { opacity: 0.7 },
  actionMuted: { backgroundColor: colors.surface },
  actionPrimary: { backgroundColor: colors.primary },
  actionDanger: { backgroundColor: colors.danger },
  actionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, lineHeight: 16, color: colors.black },
  actionStrongLabel: { color: colors.white },
  busy: { opacity: 0.6 },
});
