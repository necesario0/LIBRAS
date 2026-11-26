import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/** A Book's LC call number in its blue pill (Figma 1187:1479): where the Copy stands on the shelf. The Book page and the Borrow sheet show it. */
export function CallNumber({ value, testID }: { value: string; testID?: string }) {
  return (
    <View style={styles.pill} testID={testID} accessibilityLabel={`Call number ${value}`}>
      <Text style={styles.label}>CALL NO.</Text>
      <Text style={styles.text}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.callNumber,
    backgroundColor: colors.callNumber,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: { fontFamily: fontFamily.monoLabel, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.black },
  text: { fontFamily: fontFamily.mono, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.black },
});
