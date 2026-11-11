import { Image, StyleSheet, View } from "react-native";
import book from "../../assets/images/libras-book.png";

interface BookIllustrationProps {
  width: number;
  height: number;
}

/**
 * The open-book drawing. The Figma export is a 2000 pt square with the drawing
 * off-centre, so it is cropped the way the design crops it: the image is
 * 214.14% by 316.42% of the frame, shifted left 54.55% and up 104.48%.
 */
export function BookIllustration({ width, height }: BookIllustrationProps) {
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.crop}>
        <Image source={book} style={styles.image} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  crop: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  image: { position: "absolute", width: "214.14%", height: "316.42%", left: "-54.55%", top: "-104.48%" },
});
