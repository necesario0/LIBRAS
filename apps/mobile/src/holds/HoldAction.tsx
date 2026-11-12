import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HOLD_STATUS_LABELS, canBorrow, formatLibraryDateTime } from "@libras/shared";
import type { AccountType, BookDetail } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { activeHolds, holdFailureMessage, placeHold, useHolds } from "./useHolds";

/**
 * The Hold action of the Book page. It appears only for a Member who can
 * borrow and only when the Book has no available Copy. With a Hold already
 * active it shows where the Member stands instead of a second button: for a
 * ready Hold, until when the Copy is set aside and the way to the Digital ID.
 * There is no Figma frame for it: it uses the page's own panel style.
 */
export function HoldAction({ book, accountType }: { book: BookDetail; accountType: AccountType }) {
  const router = useRouter();
  const { request } = useAuth();
  const { state, reload } = useHolds(request);
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  if (!canBorrow(accountType) || book.availableCopies > 0) return null;
  if (state.status === "loading") return null;

  const existing = state.status === "loaded" ? activeHolds(state.holds).find((hold) => hold.bookId === book.id) : undefined;

  if (existing) {
    return (
      <View style={styles.panel} testID="hold-placed">
        <Text style={styles.title} accessibilityRole="header">
          {`You have a Hold on this Book: ${HOLD_STATUS_LABELS[existing.status].toLowerCase()}`}
        </Text>
        <Text style={styles.body}>
          {existing.status === "ready"
            ? `A Copy is set aside for you${
                existing.pickupEndsAt === null ? "" : ` until ${formatLibraryDateTime(existing.pickupEndsAt)}`
              }. Show your Digital ID at the library desk to borrow it.`
            : "You are in the queue. You will be told when a Copy is set aside for you."}
        </Text>
        {existing.status === "ready" ? (
          <Button label="Show my Digital ID" radius={radii.formButton} onPress={() => router.push("/digital-id")} testID="hold-digital-id" />
        ) : null}
        <Button label="See my Holds" tone="muted" radius={radii.formButton} onPress={() => router.push("/holds")} testID="hold-see-all" />
      </View>
    );
  }

  const place = async () => {
    setPlacing(true);
    setFailure(undefined);
    try {
      await placeHold(request, book.id);
      await reload();
    } catch (error) {
      setFailure(holdFailureMessage(error, "Your Hold could not be placed. Please try again."));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <View style={styles.panel} testID="hold-action">
      <Text style={styles.title} accessibilityRole="header">
        No Copy is available right now
      </Text>
      <Text style={styles.body}>Place a Hold to join the queue. You will be told when a Copy is set aside for you.</Text>
      {failure === undefined ? null : (
        <Text style={styles.failure} accessibilityRole="alert" testID="hold-error">
          {failure}
        </Text>
      )}
      <Button label="Place a Hold" radius={radii.formButton} onPress={() => void place()} loading={placing} testID="hold-place" />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
  failure: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.danger, marginBottom: spacing.xs },
});
