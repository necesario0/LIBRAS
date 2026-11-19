import { Image, StyleSheet, Text, View } from "react-native";
import logo from "../../assets/images/libras-logo.png";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/** The round Monogram L-Book logo and the "Libras." wordmark at the top of onboarding screens. */
export function Wordmark() {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
      <View style={styles.wordRow}>
        <Text style={styles.name}>Libras</Text>
        <View style={styles.dot} importantForAccessibility="no-hide-descendants" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  logo: { width: 31, height: 31, borderRadius: radii.logo },
  wordRow: { flexDirection: "row", alignItems: "flex-end" },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.title,
    lineHeight: lineHeightFor(fontSize.title),
    letterSpacing: -0.7,
    color: colors.brandInk,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.wordmarkDot,
    backgroundColor: colors.accent,
    marginLeft: 2,
    marginBottom: 6,
  },
});
