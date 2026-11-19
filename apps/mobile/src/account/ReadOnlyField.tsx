import { StyleSheet, Text, View } from "react-native";
import { colors, controlHeight, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/** A label over a grey pill that shows a value the Member cannot edit here (the fields of Figma 580:1742). */
export function ReadOnlyField({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <Text style={styles.value} numberOfLines={1} testID={testID}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { fontFamily: fontFamily.extraLight, fontSize: fontSize.note, letterSpacing: -0.9, lineHeight: lineHeightFor(fontSize.note), color: colors.black },
  field: { height: controlHeight, justifyContent: "center", padding: spacing.inset, borderRadius: radii.field, backgroundColor: colors.surface },
  value: { fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), letterSpacing: -0.96, color: colors.black },
});
