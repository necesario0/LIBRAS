import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** The home screen's way to the Digital ID: one tap, so it is quick to show at the desk. */
export function DigitalIdEntry() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="My Digital ID. Show it to the librarian at the desk."
      onPress={() => router.push("/digital-id")}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
      testID="home-digital-id"
    >
      <View style={styles.icon}>
        <Svg width={26} height={20} viewBox="0 0 26 20" accessibilityElementsHidden importantForAccessibility="no">
          <Path d="M0 0h3v20H0zM5 0h1v20H5zM8 0h3v20H8zM13 0h1v20h-1zM16 0h2v20h-2zM20 0h1v20h-1zM23 0h3v20h-3z" fill={colors.black} />
        </Svg>
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>My Digital ID</Text>
        <Text style={styles.subtitle}>Show it to the librarian at the desk</Text>
      </View>
      <Svg width={8} height={14} viewBox="0 0 8 14" accessibilityElementsHidden importantForAccessibility="no">
        <Path d="M1 1l6 6-6 6" stroke={colors.textMuted} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: radii.ticket,
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surface },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.panel,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.body, color: colors.black },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.textMuted },
});
