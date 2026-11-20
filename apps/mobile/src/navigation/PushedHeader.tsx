import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BACK_BUTTON_SIZE, BackButton } from "../account/BackButton";
import { useGoBack } from "../hooks/useGoBack";
import { colors, fontFamily, fontSize, lineHeightFor, spacing } from "../theme/tokens";

interface PushedHeaderProps {
  title: string;
  /** Names the back button. */
  testID: string;
  /** A text button at the right of the title, such as Mark all as read. */
  action?: ReactNode;
}

/**
 * The top of a screen pushed over the tabs (approved Tier 3 preview): the
 * round back button at the top left, then the title, and an action at the
 * right when the screen has one. Back goes to the screen underneath, as
 * Android's back button does.
 */
export function PushedHeader({ title, testID, action }: PushedHeaderProps) {
  const back = useGoBack();
  return (
    <View style={styles.header}>
      <BackButton onPress={back} testID={testID} />
      {/* The action goes under the title, at the right, when both do not fit on one line (large text). */}
      <View style={styles.titleAndAction}>
        <View style={styles.titleSlot}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {action === undefined ? null : <View style={styles.actionSlot}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingHorizontal: spacing.home, marginTop: 6 },
  titleAndAction: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.md, rowGap: spacing.xs },
  // As tall as the back button, so the title stays centered on it.
  titleSlot: { flexShrink: 1, minHeight: BACK_BUTTON_SIZE, justifyContent: "center" },
  actionSlot: { flexGrow: 1, alignItems: "flex-end" },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.title, letterSpacing: -1.4, lineHeight: lineHeightFor(fontSize.title), color: colors.black },
});
