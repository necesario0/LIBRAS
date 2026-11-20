import { Image, StyleSheet, View } from "react-native";
import book from "../../assets/images/libras-book.png";

interface BookIllustrationProps {
  width: number;
  height: number;
}

/** Centered UMak heron and winged open-book emblem shown on welcome, sign-in, and onboarding steps. */
export function BookIllustration({ width, height }: BookIllustrationProps) {
  return (
    <View style={[styles.frame, { width, height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={book} resizeMode="contain" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
});
