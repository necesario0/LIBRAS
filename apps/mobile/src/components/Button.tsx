import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, controlHeight, radii, typography } from "../theme/tokens";

type Tone = "primary" | "accent" | "muted";

interface ButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
  /** Blue (default), the yellow "SIGN UP" of the welcome screen, or the grey secondary button. */
  tone?: Tone;
  /** Corner radius. The Figma frames use a pill (default), 28 on forms and 16 on the account type screen. */
  radius?: number;
  disabled?: boolean;
  /** Shows a spinner in place of the label and ignores presses. */
  loading?: boolean;
}

const background: Record<Tone, string> = {
  primary: colors.primary,
  accent: colors.accent,
  muted: colors.surface,
};

const textColor: Record<Tone, string> = {
  primary: colors.white,
  accent: colors.black,
  muted: colors.black,
};

/** The Figma buttons: a 44-high block with a centred label. */
export function Button({ label, onPress, testID, tone = "primary", radius = radii.button, disabled, loading }: ButtonProps) {
  const inactive = disabled === true || loading === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading === true }}
      onPress={inactive ? undefined : onPress}
      testID={testID}
      style={[styles.button, { backgroundColor: background[tone], borderRadius: radius }, disabled === true && styles.disabled]}
    >
      {loading === true ? (
        <ActivityIndicator color={textColor[tone]} />
      ) : (
        <Text style={[styles.label, { color: textColor[tone] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: controlHeight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  disabled: { opacity: 0.5 },
  label: { ...typography.body },
});
