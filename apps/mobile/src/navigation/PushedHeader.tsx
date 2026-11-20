import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "../account/BackButton";
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
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.home, marginTop: 6 },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.title, letterSpacing: -1.4, lineHeight: lineHeightFor(fontSize.title), color: colors.black },
});
