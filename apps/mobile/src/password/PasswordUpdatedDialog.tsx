import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SuccessCheckIcon } from "../components/icons";
import { colors, fontFamily, fontSize, passwordActionHeight, radii, spacing } from "../theme/tokens";

const BADGE = 76;

interface PasswordUpdatedDialogProps {
  visible: boolean;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * "Password updated" (Figma "Change Password 04 - Success", 928:14929): a
 * white dialog over the dimmed form, with a green tick, a message and one
 * button. Forgot password and Change password both end on it.
 */
export function PasswordUpdatedDialog({ visible, message, actionLabel, onAction }: PasswordUpdatedDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onAction}>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal testID="password-updated">
          <View style={styles.badge}>
            <SuccessCheckIcon />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Password updated
          </Text>
          <Text style={styles.message} testID="password-updated-message">
            {message}
          </Text>
          <Pressable accessibilityRole="button" onPress={onAction} style={styles.action} testID="password-updated-action">
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
  dialog: {
    width: "100%",
    maxWidth: 330,
    backgroundColor: colors.white,
    borderRadius: radii.dialog,
    paddingTop: 28,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: 14,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: colors.successSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.note, lineHeight: 20, color: colors.ink },
  message: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 17, color: colors.textSubtle, textAlign: "center", maxWidth: 282 },
  action: {
    alignSelf: "stretch",
    height: passwordActionHeight,
    borderRadius: radii.passwordAction,
    backgroundColor: colors.save,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, color: colors.ink },
});
