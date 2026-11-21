import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, fontSize, radii } from "../theme/tokens";

/**
 * A bottom sheet over a dimmed screen, in the approved Tier 3 preview's style:
 * a grabber, a heading with an optional action at its right (such as Reset),
 * then the content, which scrolls when it is taller than the sheet may grow
 * (86% of the screen). It rises when it opens; the scrim and Android back close
 * it. The content brings its own closing button.
 */
export function BottomSheet({
  visible,
  title,
  headAction,
  onClose,
  closeLabel,
  testID,
  children,
}: {
  visible: boolean;
  title: string;
  /** Drawn at the right of the heading. */
  headAction?: ReactNode;
  onClose: () => void;
  /** What a screen reader says for the scrim, which closes the sheet: "Close filters". */
  closeLabel: string;
  /** The sheet's id; the scrim gets `<testID>-scrim` and the heading `<testID>-title`. */
  testID: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, rise]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.scrim} testID={`${testID}-scrim`} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 30, transform: [{ translateY }] }]} accessibilityViewIsModal testID={testID}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header" testID={`${testID}-title`}>
                {title}
              </Text>
              {headAction}
            </View>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    maxHeight: "86%",
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  content: { paddingTop: 10, paddingHorizontal: 22 },
  grab: { alignSelf: "center", width: 44, height: 5, borderRadius: radii.grabber, backgroundColor: colors.grabber, marginBottom: 14 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.name, lineHeight: 28, letterSpacing: -0.8, color: colors.black },
});
