import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VERIFICATION_CODE_LENGTH as CODE_LENGTH } from "@libras/shared";
import { useScreenTop } from "../hooks/useScreenTop";
import { colors, controlHeight, fontFamily, fontSize, radii, spacing } from "../theme/tokens";
import { ConsentText } from "./ConsentText";
import { KeyboardAvoiding } from "./KeyboardAvoiding";
import { LoaderIcon } from "./icons";
import { Wordmark } from "./Wordmark";

/** Spins its child, like the loader in Figma frames 228 to 230. */
function Spinner({ children }: { children: ReactNode }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Something went wrong. Please try again.";
}

interface CodeEntryScreenProps {
  title: string;
  /** Where the code was sent. */
  email: string;
  /** Checks the code. Throws, with a message for the person, when it is refused. */
  onSubmit: (code: string) => Promise<void>;
  /** Asks for a new code. Resolves with the notice to show. */
  onResend: () => Promise<string>;
  resendLabel: string;
  onChangeEmail: () => void;
  /** Shown before anything is typed, for example why the person is here. */
  initialNotice?: string;
}

/**
 * The code entry of the Figma frames "iPhone 17 - 227" to "231": the person
 * types the 6-digit code from the email, and it is checked as soon as the sixth
 * digit is in. A refused code shows why, and the resend link asks for a new
 * one. Sign-up verification and Forgot password both use it.
 */
export function CodeEntryScreen({ title, email, onSubmit, onResend, resendLabel, onChangeEmail, initialNotice }: CodeEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>(initialNotice);
  const [resending, setResending] = useState(false);

  async function submit(entered: string) {
    setChecking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await onSubmit(entered);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setChecking(false);
    }
  }

  function onChangeCode(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(undefined);
    setNotice(undefined);
    if (digits.length === CODE_LENGTH) void submit(digits);
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const sent = await onResend();
      setCode("");
      setNotice(sent);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 5 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.panel}>
          <View style={styles.sent}>
            <Text style={styles.sentLabel}>We sent an email to</Text>
            <Text style={styles.sentAddress} testID="verify-email">
              {email}
            </Text>
          </View>
          <View
            style={[
              styles.codeField,
              focused && styles.codeFieldFocused,
              error !== undefined && styles.codeFieldInvalid,
            ]}
          >
            <TextInput
              testID="verify-code"
              value={code}
              onChangeText={onChangeCode}
              placeholder="Enter Code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              editable={!checking}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityLabel="Verification code"
              style={styles.codeInput}
            />
            {checking ? (
              <View style={styles.codeSpinner}>
                <Spinner>
                  <LoaderIcon />
                </Spinner>
              </View>
            ) : null}
          </View>
          {error === undefined ? null : (
            <Text style={styles.error} accessibilityRole="alert" testID="verify-error">
              {error}
            </Text>
          )}
          {notice === undefined ? null : (
            <Text style={styles.notice} testID="verify-notice">
              {notice}
            </Text>
          )}
          <Pressable onPress={() => void resend()} accessibilityRole="button" testID="verify-resend" hitSlop={8}>
            <Text style={styles.resend}>{resendLabel}</Text>
          </Pressable>
          <Pressable onPress={onChangeEmail} accessibilityRole="link" testID="verify-change-email" hitSlop={8}>
            <Text style={styles.change}>Change email address</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <ConsentText />
      </View>
    </KeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, alignItems: "center", paddingHorizontal: 31, paddingBottom: spacing.lg },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.subheading,
    lineHeight: fontSize.subheading + 3,
    color: colors.black,
    textAlign: "center",
    marginTop: 83,
    paddingHorizontal: spacing.xl,
  },
  panel: {
    alignSelf: "stretch",
    minHeight: 162,
    marginTop: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radii.panel,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sent: { alignItems: "center", gap: 1 },
  sentLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.note, color: colors.textSecondary, textAlign: "center" },
  sentAddress: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black, textAlign: "center" },
  codeField: {
    width: 144,
    height: controlHeight,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  codeFieldFocused: { backgroundColor: colors.white, borderColor: colors.primary },
  codeFieldInvalid: { borderColor: colors.error, backgroundColor: colors.white },
  codeInput: {
    height: "100%",
    paddingVertical: 0,
    paddingHorizontal: spacing.md,
    textAlign: "center",
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.black,
  },
  codeSpinner: { position: "absolute", right: 5, top: 0, bottom: 0, justifyContent: "center" },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.error, textAlign: "center" },
  notice: { fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.textSecondary, textAlign: "center" },
  resend: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.black,
    textDecorationLine: "underline",
  },
  change: { fontFamily: fontFamily.regular, fontSize: fontSize.body, color: colors.textMuted, textAlign: "center" },
  footer: { paddingHorizontal: spacing.screen, paddingTop: spacing.md },
});
