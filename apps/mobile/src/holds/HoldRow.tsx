import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { HOLD_STATUS_LABELS, formatLibraryDateTime } from "@libras/shared";
import type { Hold, HoldStatus } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** Fill and text of the status pill, from the pills the Book page already uses. */
const PILL: Record<HoldStatus, { surface: string; text: string }> = {
  waiting: { surface: colors.selected, text: colors.primary },
  ready: { surface: colors.availableSurface, text: colors.availableText },
  fulfilled: { surface: colors.successSurface, text: colors.success },
  expired: { surface: colors.pill, text: colors.textMuted },
  cancelled: { surface: colors.pill, text: colors.textMuted },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "20 Nov 2026", in the phone's time zone. */
export function placedOn(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

interface HoldRowProps {
  hold: Hold;
  /** Cancels the Hold. Rejects with a message safe to show. */
  onCancel: (hold: Hold) => Promise<void>;
}

/**
 * One of the Member's Holds: the Book, its status and when the Hold was placed.
 * A ready Hold says that a Copy is set aside and when the Pickup Window ends, in
 * the library's time. A waiting or ready Hold has a Cancel button that asks once
 * more: a waiting Hold leaves the queue, a ready one gives its Copy up.
 */
export function HoldRow({ hold, onCancel }: HoldRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const pill = PILL[hold.status];

  const cancel = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      await onCancel(hold);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Your Hold could not be cancelled. Please try again.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row} testID={`hold-${hold.id}`}>
      <View style={styles.main}>
        <BookCover id={hold.bookId} width={36} height={52} radius={6} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2} testID="hold-title">
            {hold.bookTitle}
          </Text>
          <Text style={styles.authors} numberOfLines={1}>
            {hold.bookAuthors.length > 0 ? hold.bookAuthors.join("; ") : "Unknown author"}
          </Text>
          <Text style={styles.placed}>{`Placed ${placedOn(hold.placedAt)}`}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: pill.surface }]} testID="hold-status">
          <Text style={[styles.pillText, { color: pill.text }]}>{HOLD_STATUS_LABELS[hold.status]}</Text>
        </View>
      </View>

      {hold.status === "ready" && hold.pickupEndsAt !== null ? (
        <View style={styles.pickup} testID="hold-pickup">
          <Text style={styles.pickupTitle}>A Copy is set aside for you</Text>
          <Text style={styles.pickupBody}>
            {"Show your Digital ID at the library desk by "}
            <Text style={styles.pickupUntil}>
              {formatLibraryDateTime(hold.pickupEndsAt)}
            </Text>
            {" to borrow it. After that your Hold expires."}
          </Text>
        </View>
      ) : null}

      {failure === undefined ? null : (
        <Text style={styles.failure} accessibilityRole="alert" testID="hold-cancel-error">
          {failure}
        </Text>
      )}

      {hold.status !== "waiting" && hold.status !== "ready" ? null : confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            {hold.status === "ready" ? "Give up the Copy that is set aside for you?" : "Leave the queue for this Book?"}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void cancel()}
              style={[styles.action, styles.actionDanger, busy && styles.busy]}
              testID="hold-cancel-confirm"
            >
              <Text style={[styles.actionLabel, styles.actionDangerLabel]}>{busy ? "Cancelling..." : "Yes, cancel"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setConfirming(false)}
              style={[styles.action, styles.actionMuted]}
              testID="hold-cancel-keep"
            >
              <Text style={styles.actionLabel}>Keep Hold</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirming(true)}
          style={[styles.action, styles.actionMuted, styles.cancel]}
          testID="hold-cancel"
        >
          <Text style={styles.actionLabel}>Cancel Hold</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surface },
  main: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.black },
  authors: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
  placed: { fontFamily: fontFamily.regular, fontSize: fontSize.micro, color: colors.textFaint },
  pill: { borderRadius: radii.panel, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.micro },
  pickup: { borderRadius: radii.panel, backgroundColor: colors.successSurface, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: 2 },
  pickupTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.availableText },
  pickupBody: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textSecondary },
  pickupUntil: { fontFamily: fontFamily.semiBold, color: colors.black },
  failure: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.danger },
  confirm: { gap: spacing.sm },
  confirmText: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { height: 36, borderRadius: radii.button, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  cancel: { alignSelf: "flex-start" },
  actionMuted: { backgroundColor: colors.surface },
  actionDanger: { backgroundColor: colors.danger },
  actionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, color: colors.black },
  actionDangerLabel: { color: colors.white },
  busy: { opacity: 0.6 },
});
