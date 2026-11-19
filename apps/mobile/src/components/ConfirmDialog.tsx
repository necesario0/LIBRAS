import type { ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { actionHeight, colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";
import { KeyboardAvoiding } from "./KeyboardAvoiding";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** The label of the button that backs out. Default "Cancel". */
  cancelLabel?: string;
  /** Leave the dialog without doing anything: the cancel button, the scrim and Android's back button. */
  onCancel: () => void;
  onConfirm: () => void;
  /** What the dialog asks for under the message, such as a password field. */
  children?: ReactNode;
  /** The confirmed action is running: both buttons are off and the confirm button shows a spinner. */
  busy?: boolean;
  /** An error to show under the message, such as "could not be reached". */
  error?: string;
  /** `danger` fills the confirm button in red: an action that cannot be undone (Delete account). */
  tone?: "normal" | "danger";
  /** Names the dialog; its message is `<testID>-message` and its buttons `<testID>-cancel` and `<testID>-confirm`. */
  testID: string;
}

/**
 * A question with two answers (approved Tier 3 preview): a white dialog over
 * the dimmed screen with an outlined button that backs out and one filled
 * button that goes ahead, yellow or, for an action that cannot be undone, red.
 * Sign out of all devices and Delete my account use it. It rises above the
 * keyboard when it holds a field.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
  children,
  busy = false,
  error,
  tone = "normal",
  testID,
}: ConfirmDialogProps) {
  const danger = tone === "danger";
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={busy ? undefined : onCancel}>
      <KeyboardAvoiding style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert" testID={testID}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message} testID={`${testID}-message`}>
            {message}
          </Text>
          {children}
          {error === undefined ? null : (
            <Text style={styles.error} accessibilityRole="alert" testID={`${testID}-error`}>
              {error}
            </Text>
          )}
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[styles.button, styles.cancel]} testID={`${testID}-cancel`}>
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onConfirm}
              style={[styles.button, danger ? styles.dangerConfirm : styles.confirm]}
              testID={`${testID}-confirm`}
            >
              {busy ? (
                <ActivityIndicator color={danger ? colors.white : colors.ink} />
              ) : (
                <Text style={[styles.confirmLabel, danger && styles.dangerLabel]}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoiding>
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
  button: { flex: 1, height: actionHeight, borderRadius: radii.roundAction, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  // The preview's outlined button that backs out: a red outline and label, as Cancel of the password screens.
  cancel: { borderWidth: 1, borderColor: colors.dismiss, backgroundColor: colors.white },
  cancelLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.dismiss },
  confirm: { backgroundColor: colors.confirm },
  confirmLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.ink, textAlign: "center" },
  dangerConfirm: { backgroundColor: colors.danger },
  dangerLabel: { color: colors.white },
});
