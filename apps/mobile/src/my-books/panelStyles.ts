import { StyleSheet } from "react-native";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The message panels and section labels the segments of My Books share. */
export const panelStyles = StyleSheet.create({
  segment: { gap: spacing.lg },
  spinner: { marginTop: spacing.xl },
  section: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, lineHeight: 17, color: colors.textMuted },
  panel: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  failed: { borderColor: colors.error },
  panelTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, lineHeight: 20, color: colors.black },
  failedTitle: { color: colors.danger },
  panelBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 19, color: colors.textSecondary, marginBottom: spacing.sm },
  notice: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 19, color: colors.textSecondary },
});
