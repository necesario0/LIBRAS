import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { KeyboardTypeOptions, ReturnKeyTypeOptions, TextInputProps } from "react-native";
import { colors, controlHeight, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { VisibilityIcon, VisibilityOffIcon } from "./icons";

interface FieldLabelProps {
  label: string;
  required?: boolean;
  /** Shown in grey after the label, for example "(optional)". */
  hint?: string;
  size?: number;
}

/** The label above a field, with the red asterisk of a required one. */
export function FieldLabel({ label, required, hint, size = fontSize.label }: FieldLabelProps) {
  return (
    <Text style={[styles.label, { fontSize: size }]}>
      {label}
      {hint === undefined ? null : <Text style={styles.hint}>{` ${hint}`}</Text>}
      {required === true ? <Text style={styles.asterisk}>{" *"}</Text> : null}
    </Text>
  );
}

/** A message under a field, in the design's red. */
export function FieldError({ message, testID }: { message: string | undefined; testID?: string }) {
  if (message === undefined) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert" testID={testID}>
      {message}
    </Text>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  /** A password: its characters show as dots. */
  secure?: boolean;
  /** Adds the eye that shows the password (Figma has it on the password field only). */
  revealable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  maxLength?: number;
  labelSize?: number;
}

/**
 * A text field of the onboarding forms: a 44-high pill, grey at rest and white
 * with a blue outline while it has focus. Text and indent follow the frames: a
 * placeholder is 16 pt and 10 pt in, typed text is 14 pt and 19 pt in.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  required,
  hint,
  error,
  secure = false,
  revealable = false,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  maxLength,
  labelSize,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const filled = value.length > 0;
  const showEye = secure && revealable;

  return (
    <View style={styles.group}>
      <FieldLabel label={label} required={required} hint={hint} size={labelSize} />
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error !== undefined && !focused && styles.fieldInvalid,
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !(revealable && revealed)}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={[styles.input, filled ? styles.inputFilled : styles.inputEmpty]}
        />
        {showEye ? (
          <Pressable
            onPress={() => setRevealed((shown) => !shown)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={12}
            style={styles.eye}
            testID={`${testID}-toggle`}
          >
            {revealed ? <VisibilityIcon /> : <VisibilityOffIcon />}
          </Pressable>
        ) : null}
      </View>
      <FieldError message={error} testID={`${testID}-error`} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs + 1 },
  label: { fontFamily: fontFamily.regular, color: colors.black },
  hint: { color: colors.hint },
  asterisk: { color: colors.error },
  field: {
    height: controlHeight,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldFocused: { backgroundColor: colors.white, borderColor: colors.primary },
  fieldInvalid: { borderColor: colors.error },
  input: { flex: 1, height: "100%", paddingVertical: 0, color: colors.black, fontFamily: fontFamily.regular },
  inputEmpty: { fontSize: fontSize.body, paddingLeft: spacing.sm + 1, paddingRight: spacing.sm + 1 },
  inputFilled: { fontSize: fontSize.label, paddingLeft: 18, paddingRight: spacing.sm + 1 },
  eye: { paddingRight: spacing.md, alignItems: "center", justifyContent: "center" },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.error },
});
