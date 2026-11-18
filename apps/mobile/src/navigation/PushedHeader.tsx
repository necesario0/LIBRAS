import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "../account/BackButton";
import { useGoBack } from "../hooks/useGoBack";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

/**
 * The top of a screen pushed over the tabs (approved Tier 3 preview): the
 * round back button at the top left, then the title. Back goes to the screen
 * underneath, as Android's back button does. `testID` names the back button.
 */
export function PushedHeader({ title, testID }: { title: string; testID: string }) {
  const back = useGoBack();
  return (
    <View style={styles.header}>
      <BackButton onPress={back} testID={testID} />
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.home, marginTop: 6 },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.title, letterSpacing: -1.4, lineHeight: 33, color: colors.black },
});
