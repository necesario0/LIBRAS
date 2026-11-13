import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

const STEPS = [1, 2, 3, 4] as const;
const CIRCLE = 32;

interface StepProgressProps {
  /** 1 to 4. */
  step: 1 | 2 | 3 | 4;
}

/** "Step n of 4" over four numbered circles joined by lines (Figma "LIBRAS step progress"). */
export function StepProgress({ step }: StepProgressProps) {
  return (
    <View style={styles.container} accessibilityLabel={`Step ${step} of ${STEPS.length}`} testID="step-progress">
      <Text style={styles.caption}>{`Step ${step} of ${STEPS.length}`}</Text>
      <View style={styles.track}>
        {STEPS.map((n) => {
          const reached = n <= step;
          const last = n === STEPS.length;
          return (
            <View key={n} style={[styles.segment, last ? styles.segmentLast : styles.segmentGrow]}>
              <View style={[styles.circle, reached ? styles.circleReached : styles.circleUpcoming]}>
                <Text style={[styles.number, reached && styles.numberReached]}>{n}</Text>
              </View>
              {last ? null : <View style={[styles.line, n < step && styles.lineReached]} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, width: "100%" },
  caption: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.link },
  track: { flexDirection: "row", alignItems: "center", gap: 6 },
  segment: { flexDirection: "row", alignItems: "center", gap: 6 },
  segmentGrow: { flex: 1 },
  segmentLast: {},
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: "center", justifyContent: "center" },
  circleReached: { backgroundColor: colors.primary },
  circleUpcoming: { backgroundColor: colors.border },
  number: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.link },
  numberReached: { color: colors.white },
  line: { flex: 1, height: 2, borderRadius: radii.progress, backgroundColor: colors.border },
  lineReached: { backgroundColor: colors.primary },
});
