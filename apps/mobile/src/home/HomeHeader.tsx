import { Image, StyleSheet, Text, View } from "react-native";
import avatar from "../../assets/images/home-avatar.png";
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
      <View style={styles.avatarClip}>
        {/* The design crops the exported artwork: it is drawn 248.68% of the circle, offset by -74.47% and -73.99%. */}
        <Image
          source={avatar}
          accessibilityIgnoresInvertColors
          style={{ position: "absolute", width: AVATAR * 2.4868, height: AVATAR * 2.4868, left: -AVATAR * 0.7447, top: -AVATAR * 0.7399 }}
        />
      </View>
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
  avatarClip: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: "hidden" },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: fontSize.large, letterSpacing: -1.44, color: colors.black, lineHeight: 24 },
  prompt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.micro, letterSpacing: -0.6, color: colors.textFaint, lineHeight: 10 },
});
