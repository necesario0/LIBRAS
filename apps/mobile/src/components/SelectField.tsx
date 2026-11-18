import { useRef, useState } from "react";
import type { ComponentRef } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, controlHeight, fontFamily, fontSize, lineHeightFor, menuRowShadow, radii, spacing } from "../theme/tokens";
import { ChevronBackIcon } from "./icons";
import { FieldError, FieldLabel } from "./TextField";

/** How many rows the open list shows before it scrolls: the half row says there is more. */
const VISIBLE_ROWS = 4.5;
/** Below this many rows of room under the field, the list opens above it. */
const MIN_ROWS_BELOW = 3;
const OPTION_PADDING = spacing.sm + 1;
const LIST_PADDING = spacing.sm;
/** The gap between the field and the open list. */
const LIST_OFFSET = spacing.xs;
/** The least room the list keeps from the top and bottom of the screen. */
const EDGE = spacing.lg;

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

/** Where the open list is drawn, in screen coordinates. */
interface ListFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Runs `then` once the keyboard is down, so what is measured next is the layout without it. */
function afterKeyboard(then: () => void) {
  if (!Keyboard.isVisible()) {
    then();
    return;
  }
  const hidden = Keyboard.addListener("keyboardDidHide", () => {
    hidden.remove();
    requestAnimationFrame(then);
  });
  Keyboard.dismiss();
}

/**
 * A choice from a list. The field looks like the text fields with a chevron.
 * Tapping it drops a list just under it (or just above it when the screen has
 * too little room below), over the screen, about four and a half rows high and
 * scrolling inside itself, so nothing on the screen moves (the sign-up step
 * footer stays where it is). Tapping outside the list or Android's back button
 * closes it. The list's test id is `<testID>-list`, each row's
 * `<testID>-option-<option>`.
 */
export function SelectField<T extends string>({ label, placeholder, options, value, onChange, testID, required, error }: SelectFieldProps<T>) {
  const field = useRef<ComponentRef<typeof Pressable>>(null);
  const [frame, setFrame] = useState<ListFrame | undefined>();
  const { height: screenHeight, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = frame !== undefined;

  // The rows grow with the phone's font size, and so does the list, to keep showing the same number of them.
  const rowHeight = 2 * OPTION_PADDING + lineHeightFor(fontSize.label) * fontScale;
  const fullHeight = Math.min(options.length, VISIBLE_ROWS) * rowHeight + 2 * LIST_PADDING + 2;

  function place(x: number, y: number, width: number, height: number) {
    const top = y + height + LIST_OFFSET;
    const roomBelow = screenHeight - insets.bottom - EDGE - top;
    const roomAbove = y - LIST_OFFSET - insets.top - EDGE;
    const below = roomBelow >= Math.min(fullHeight, MIN_ROWS_BELOW * rowHeight) || roomBelow >= roomAbove;
    const listHeight = Math.min(fullHeight, below ? roomBelow : roomAbove);
    setFrame({ left: x, width, height: listHeight, top: below ? top : y - LIST_OFFSET - listHeight });
  }

  function toggle() {
    if (open) {
      setFrame(undefined);
      return;
    }
    afterKeyboard(() => field.current?.measureInWindow(place));
  }

  return (
    <View style={styles.group}>
      <FieldLabel label={label} required={required} />
      <Pressable
        ref={field}
        onPress={toggle}
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        testID={testID}
        style={[styles.field, open && styles.fieldOpen, error !== undefined && !open && styles.fieldInvalid]}
      >
        <Text style={value === undefined ? styles.placeholder : styles.value} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <ChevronBackIcon rotate={open ? 90 : -90} />
      </Pressable>
      <FieldError message={error} testID={`${testID}-error`} />

      <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFrame(undefined)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFrame(undefined)} accessibilityLabel={`Close ${label}`} testID={`${testID}-dismiss`} />
        {frame === undefined ? null : (
          <ScrollView style={[styles.list, frame]} contentContainerStyle={styles.listContent} persistentScrollbar accessibilityRole="list" testID={`${testID}-list`}>
            {options.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: option === value }}
                onPress={() => {
                  onChange(option);
                  setFrame(undefined);
                }}
                testID={`${testID}-option-${option}`}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Modal>
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
  placeholder: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), color: colors.textMuted },
  value: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.body, lineHeight: lineHeightFor(fontSize.body), color: colors.black },
  list: {
    position: "absolute",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.listBorder,
    borderRadius: radii.list,
    boxShadow: menuRowShadow,
  },
  listContent: { paddingVertical: LIST_PADDING },
  option: { paddingVertical: OPTION_PADDING, paddingHorizontal: 17 },
  optionPressed: { backgroundColor: colors.surface },
  optionText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.black },
});
