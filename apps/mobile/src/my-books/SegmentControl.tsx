import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** One segment: what it is called, whether it needs the Member (a red dot), and its test id. */
export interface Segment<Key extends string> {
  key: Key;
  label: string;
  dot: boolean;
  testID: string;
}

interface SegmentControlProps<Key extends string> {
  segments: readonly Segment<Key>[];
  /** The segment shown, or undefined while My Books does not know yet which to open on. */
  selected: Key | undefined;
  onSelect: (key: Key) => void;
}

/**
 * The segment control of My Books (approved Tier 3 preview): equal segments
 * in a grey pill, the selected one yellow with a black outline. A segment that
 * needs the Member has the same red dot as the My Books tab.
 */
export function SegmentControl<Key extends string>({ segments, selected, onSelect }: SegmentControlProps<Key>) {
  return (
    <View style={styles.control} accessibilityRole="tablist">
      {segments.map((segment) => {
        const on = segment.key === selected;
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={segment.dot ? `${segment.label}, needs your attention` : segment.label}
            onPress={() => onSelect(segment.key)}
            style={[styles.segment, on && styles.on]}
            testID={segment.testID}
          >
            <Text style={styles.label}>{segment.label}</Text>
            {segment.dot ? <View style={styles.dot} testID={`${segment.testID}-dot`} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const DOT = 7;

const styles = StyleSheet.create({
  control: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radii.segments, backgroundColor: colors.surface },
  segment: {
    flex: 1,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radii.segment,
    borderWidth: 1,
    borderColor: "transparent",
  },
  on: { backgroundColor: colors.accent, borderColor: colors.black },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.small, lineHeight: 17, color: colors.black },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.error },
});
