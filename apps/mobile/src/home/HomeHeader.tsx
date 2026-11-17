import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

const AVATAR = 50;

/**
 * The greeting row of Home (Figma 1032:2002): the Member's avatar, "Hi, <first
 * name>" and the line under it. The notification bell and the menu button are
 * left out: nothing is built behind them yet.
 */
export function HomeHeader({ firstName }: { firstName: string }) {
  return (
    <View style={styles.row}>
      <Avatar size={AVATAR} />
      <View>
        <Text style={styles.greeting} accessibilityRole="header" testID="home-greeting" numberOfLines={1}>
          {`Hi, ${firstName}`}
        </Text>
        <Text style={styles.prompt}>Whats on your mind</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: fontSize.large, letterSpacing: -1.44, color: colors.black, lineHeight: 24 },
  prompt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.micro, letterSpacing: -0.6, color: colors.textFaint, lineHeight: 10 },
});
