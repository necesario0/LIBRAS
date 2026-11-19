import { Image, StyleSheet, Text, View } from "react-native";
import logo from "../../assets/images/libras-logo.png";
import { colors, radii, spacing, typography } from "../theme/tokens";

/** The round logo and the word "LIBRAS", as at the top of every onboarding frame. */
export function Wordmark() {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
      <Text style={styles.name}>LIBRAS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs + 1 },
  logo: { width: 31, height: 31, borderRadius: radii.logo },
  name: { ...typography.title, color: colors.black },
});
