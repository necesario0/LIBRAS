import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HOLD_STATUS_LABELS, formatLibraryDate, formatLibraryDateTime } from "@libras/shared";
import type { Hold, HoldStatus } from "@libras/shared";
import { BookCover } from "../components/BookCover";
import { RowAction, RowConfirmation } from "../components/RowConfirmation";
import { StatusPill } from "../components/StatusPill";
import type { PillTone } from "../components/StatusPill";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** What each status says, for its pill. */
const PILL_TONES: Readonly<Record<HoldStatus, PillTone>> = {
  waiting: "info",
  ready: "available",
  fulfilled: "success",
  expired: "neutral",
  cancelled: "neutral",
};

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
        <BookCover id={hold.bookId} width={36} height={52} radius={radii.coverSmall} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2} testID="hold-title">
            {hold.bookTitle}
          </Text>
          <Text style={styles.authors} numberOfLines={1}>
            {hold.bookAuthors.length > 0 ? hold.bookAuthors.join("; ") : "Unknown author"}
          </Text>
          <Text style={styles.placed}>{`Placed ${formatLibraryDate(hold.placedAt)}`}</Text>
        </View>
        <StatusPill label={HOLD_STATUS_LABELS[hold.status]} tone={PILL_TONES[hold.status]} testID="hold-status" />
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
        <RowConfirmation
          question={hold.status === "ready" ? "Give up the Copy that is set aside for you?" : "Leave the queue for this Book?"}
          confirm={{ label: "Yes, cancel", busyLabel: "Cancelling...", tone: "danger", testID: "hold-cancel-confirm" }}
          keep={{ label: "Keep Hold", testID: "hold-cancel-keep" }}
          busy={busy}
          onConfirm={() => void cancel()}
          onKeep={() => setConfirming(false)}
        />
      ) : (
        <RowAction label="Cancel Hold" onPress={() => setConfirming(true)} testID="hold-cancel" />
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
  pickup: { borderRadius: radii.panel, backgroundColor: colors.successSurface, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: 2 },
  pickupTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.availableText },
  pickupBody: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.textSecondary },
  pickupUntil: { fontFamily: fontFamily.semiBold, color: colors.black },
  failure: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18, color: colors.danger },
});
