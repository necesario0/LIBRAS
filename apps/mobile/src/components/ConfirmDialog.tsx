import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { actionHeight, colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Leave the dialog without doing anything: Cancel, the scrim and Android's back button. */
  onCancel: () => void;
  onConfirm: () => void;
  /** The confirmed action is running: both buttons are off and the confirm button shows a spinner. */
  busy?: boolean;
  /** An error to show under the message, such as "could not be reached". */
  error?: string;
  /** `danger` outlines the confirm button in red (an action that cannot be undone). */
  tone?: "normal" | "danger";
  /** Names the dialog; its buttons are `<testID>-cancel` and `<testID>-confirm`. */
  testID: string;
}

/**
 * A question with two answers (approved Tier 3 preview): a white dialog over
 * the dimmed screen with Cancel and one confirming button. Sign out of all
 * devices uses it, and so can any later confirmation.
 */
export function ConfirmDialog({ visible, title, message, confirmLabel, onCancel, onConfirm, busy = false, error, tone = "normal", testID }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert" testID={testID}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          {error === undefined ? null : (
            <Text style={styles.error} testID={`${testID}-error`}>
              {error}
            </Text>
          )}
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[styles.button, styles.cancel]} testID={`${testID}-cancel`}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onConfirm}
              style={[styles.button, tone === "danger" ? styles.dangerConfirm : styles.confirm]}
              testID={`${testID}-confirm`}
            >
              {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={[styles.confirmLabel, tone === "danger" && styles.dangerLabel]}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  dialog: { width: "100%", maxWidth: 360, backgroundColor: colors.white, borderRadius: radii.dialog, paddingTop: spacing.xl, paddingBottom: 20, paddingHorizontal: 22, gap: 10 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.subheading, lineHeight: 26, letterSpacing: -0.6, color: colors.ink },
  message: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 20, color: colors.textSubtle },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 18, color: colors.danger },
  buttons: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: { flex: 1, height: actionHeight, borderRadius: radii.roundAction, alignItems: "center", justifyContent: "center" },
  cancel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  cancelLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.label, color: colors.ink },
  confirm: { backgroundColor: colors.confirm },
  confirmLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, color: colors.ink },
  dangerConfirm: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSurface },
  dangerLabel: { color: colors.danger },
});
