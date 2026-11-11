import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, controlHeight, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { ChevronBackIcon } from "./icons";
import { FieldError, FieldLabel } from "./TextField";

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder: string;
  options: readonly T[];
  value: T | undefined;
  onChange: (value: T) => void;
  testID: string;
  required?: boolean;
  error?: string | undefined;
}

/**
 * A choice from a short list. The field looks like the text fields with a
 * chevron; the list opens under it and pushes the content below it down, so
 * every row stays tappable on any screen size.
 */
export function SelectField<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  testID,
  required,
  error,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.group}>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={() => setOpen((isOpen) => !isOpen)}
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        testID={testID}
        style={[styles.field, open && styles.fieldOpen, error !== undefined && !open && styles.fieldInvalid]}
      >
        <Text style={value === undefined ? styles.placeholder : styles.value}>{value ?? placeholder}</Text>
        <ChevronBackIcon rotate={open ? 90 : -90} />
      </Pressable>
      {open ? (
        <View style={styles.list} accessibilityRole="list">
          {options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="menuitem"
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
              testID={`${testID}-option-${option}`}
              style={styles.option}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FieldError message={error} testID={`${testID}-error`} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs + 1 },
  field: {
    height: controlHeight,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: spacing.sm + 1,
    paddingRight: spacing.sm + 1,
  },
  fieldOpen: { backgroundColor: colors.white, borderColor: colors.primary },
  fieldInvalid: { borderColor: colors.error },
  placeholder: { fontFamily: fontFamily.regular, fontSize: fontSize.body, color: colors.textMuted },
  value: { fontFamily: fontFamily.regular, fontSize: fontSize.body, color: colors.black },
  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.listBorder,
    borderRadius: radii.list,
    paddingVertical: spacing.sm,
    paddingHorizontal: 17,
  },
  option: { paddingVertical: spacing.sm + 1 },
  optionText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.black },
});
