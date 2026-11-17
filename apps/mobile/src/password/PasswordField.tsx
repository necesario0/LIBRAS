import { useState } from "react";
import type { ComponentRef, Ref } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReturnKeyTypeOptions, TextInputProps } from "react-native";
import { FieldError } from "../components/TextField";
import { VisibilityIcon, VisibilityOffIcon } from "../components/icons";
import { colors, fontFamily, fontSize, passwordFieldHeight, radii, spacing } from "../theme/tokens";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID: string;
  error?: string | undefined;
  autoComplete?: TextInputProps["autoComplete"];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
}

/**
 * A password field of the Change password frames (Figma 926:14226): a 12 pt
 * label over a 48 pt grey pill with the eye that shows the password. White with
 * a blue outline while it has focus, red when it holds an error (926:14542).
 */
export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  error,
  autoComplete = "new-password",
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: PasswordFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const invalid = error !== undefined;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused ? styles.fieldFocused : invalid ? styles.fieldInvalid : undefined]}>
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoComplete={autoComplete}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={styles.input}
        />
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
      </View>
      <FieldError message={error} testID={`${testID}-error`} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.ink },
  field: {
    height: passwordFieldHeight,
    borderRadius: radii.field,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.pill,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
  },
  fieldFocused: { backgroundColor: colors.white, borderColor: colors.primary },
  fieldInvalid: { backgroundColor: colors.dangerSurface, borderColor: colors.error },
  input: { flex: 1, height: "100%", paddingVertical: 0, paddingHorizontal: 0, fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.ink },
  eye: { paddingHorizontal: spacing.lg, height: "100%", alignItems: "center", justifyContent: "center" },
});
