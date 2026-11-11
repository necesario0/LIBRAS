import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, fontSize, spacing } from "../theme/tokens";
import { BookIllustration } from "./BookIllustration";
import { ConsentText } from "./ConsentText";
import { KeyboardAvoiding } from "./KeyboardAvoiding";
import { StepProgress } from "./StepProgress";
import { Wordmark } from "./Wordmark";

/** True while the on-screen keyboard is up. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

interface OnboardingScreenProps {
  step: 1 | 2 | 3 | 4;
  /** Space between the subtitle and the form. The frames differ a little from step to step. */
  formGap: number;
  children: ReactNode;
}

/**
 * The frame every profile step shares (Figma "Create your profile"): the
 * wordmark, the book, the heading and one line under it, then the form; the
 * step progress and the consent line stay at the foot. The consent line makes
 * room for the keyboard while it is open, as in the frames.
 */
export function OnboardingScreen({ step, formGap, children }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 5 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.book}>
          <BookIllustration width={133} height={90} />
        </View>
        <Text style={styles.heading} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
          Create your profile
        </Text>
        <Text style={styles.subtitle}>create an account so you can manage your book journey</Text>
        <View style={[styles.form, { marginTop: formGap }]}>{children}</View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + (keyboardVisible ? spacing.sm : 25) }]}>
        <View style={styles.progress}>
          <StepProgress step={step} />
        </View>
        {keyboardVisible ? null : <ConsentText />}
      </View>
    </KeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: spacing.lg },
  book: { alignSelf: "center", marginTop: 21 },
  heading: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.heading,
    color: colors.black,
    textAlign: "center",
    marginTop: 7,
    paddingHorizontal: spacing.screen,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginLeft: 33,
    width: 274,
  },
  form: { paddingHorizontal: 23, gap: 28 },
  footer: { gap: spacing.xl + spacing.sm },
  progress: { marginHorizontal: 37 },
});
