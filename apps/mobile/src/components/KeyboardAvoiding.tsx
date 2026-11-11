import type { ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * A screen's root view that lifts its content above the on-screen keyboard. The
 * app draws edge to edge, so Android no longer resizes the window for the
 * keyboard on its own.
 */
export function KeyboardAvoiding({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={style}>
      {children}
    </KeyboardAvoidingView>
  );
}
