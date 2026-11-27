import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily } from "../theme/tokens";

/** "Elena" and "Cruz" become "EC"; a name part that is empty adds nothing. */
export function initials(name: { firstName: string; lastName: string }): string {
  return [name.firstName, name.lastName]
    .map((part) => Array.from(part.trim())[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/**
 * The Member's round avatar (on Home, Profile and My Account): their initials
 * on pale blue. It replaces the Figma artwork, which drew the same man for every
 * Member, until photos are built. The name is always written beside it, so
 * screen readers skip it.
 */
export function Avatar({ size, name }: { size: number; name: { firstName: string; lastName: string } }) {
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[styles.letters, { fontSize: Math.round(size * 0.36) }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", backgroundColor: colors.selected },
  letters: { fontFamily: fontFamily.semiBold, color: colors.brandInk, letterSpacing: 0.5, includeFontPadding: false },
});
