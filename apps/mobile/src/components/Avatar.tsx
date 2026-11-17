import { Image, StyleSheet, View } from "react-native";
import avatar from "../../assets/images/home-avatar.png";

/**
 * The Member's round avatar (Figma "notifications icon (3)", on Home and on
 * Profile). Every Member has the same artwork until photos are built. The
 * design crops the exported picture: it is drawn 248.68% of the circle, offset
 * by -74.47% and -73.99%.
 */
export function Avatar({ size }: { size: number }) {
  return (
    <View style={[styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={avatar}
        accessibilityIgnoresInvertColors
        style={{ position: "absolute", width: size * 2.4868, height: size * 2.4868, left: -size * 0.7447, top: -size * 0.7399 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
