import { Pressable, StyleSheet, View } from "react-native";
import { colors, radii, switchKnobShadow } from "../theme/tokens";

/** The on and off switch of the approved preview, drawn only (46 by 28, a white knob): for a row that is itself the switch. */
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </View>
  );
}

/** The on and off switch of the approved preview, tappable on its own. */
export function Toggle({ on, onPress, label, testID }: { on: boolean; onPress: () => void; label: string; testID: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      hitSlop={8}
      testID={testID}
    >
      <SwitchTrack on={on} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 46, height: 28, borderRadius: radii.switch, backgroundColor: colors.border, padding: 3 },
  trackOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: radii.switchKnob, backgroundColor: colors.white, boxShadow: switchKnobShadow },
  knobOn: { transform: [{ translateX: 18 }] },
});
