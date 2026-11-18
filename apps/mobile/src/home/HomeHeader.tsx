import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";

const AVATAR = 50;

/**
 * The greeting row of Home (Figma 1032:2002): the Member's avatar, "Hi, <first
 * name>" and the line under it. There is no bell (it returns with the
 * notification inbox) and no menu button: the tab bar is the way around.
 */
export function HomeHeader({ firstName }: { firstName: string }) {
  return (
    <View style={styles.row}>
      <Avatar size={AVATAR} />
      <View>
        <Text style={styles.greeting} accessibilityRole="header" testID="home-greeting" numberOfLines={1}>
          {`Hi, ${firstName}`}
        </Text>
        <Text style={styles.prompt}>What’s on your mind</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: fontSize.large, letterSpacing: -1.44, color: colors.black, lineHeight: 30 },
  prompt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.micro, letterSpacing: -0.6, color: colors.textFaint, lineHeight: 13 },
});
