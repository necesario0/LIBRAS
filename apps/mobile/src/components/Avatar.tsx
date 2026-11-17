import { Image, StyleSheet, View } from "react-native";
import avatar from "../../assets/images/home-avatar.png";

/**
 * The Figma export of the avatar is a larger picture that the design crops to
 * the circle: drawn this many times the circle's size, shifted left and up by
 * these fractions of it (248.68%, -74.47% and -73.99% in node 574:1557).
 */
const CROP_SCALE = 2.4868;
const CROP_LEFT = 0.7447;
const CROP_TOP = 0.7399;

/**
 * The Member's round avatar (Figma "notifications icon (3)", on Home, Profile and
 * My Account). Every Member has the same artwork until photos are built.
 */
export function Avatar({ size }: { size: number }) {
  return (
    <View style={[styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={avatar}
        accessibilityIgnoresInvertColors
        style={{ position: "absolute", width: size * CROP_SCALE, height: size * CROP_SCALE, left: -size * CROP_LEFT, top: -size * CROP_TOP }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
