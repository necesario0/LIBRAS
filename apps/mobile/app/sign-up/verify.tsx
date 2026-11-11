import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VERIFICATION_CODE_LENGTH as CODE_LENGTH } from "@libras/shared";
import { api } from "../../src/api";
import { ConsentText } from "../../src/components/ConsentText";
import { KeyboardAvoiding } from "../../src/components/KeyboardAvoiding";
import { LoaderIcon } from "../../src/components/icons";
import { Wordmark } from "../../src/components/Wordmark";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { colors, controlHeight, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

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

/**
 * "Check your email to finish signing in" (Figma "iPhone 17 - 227" to "231"):
 * the person types the 6-digit code from the email. The code is checked as soon
 * as the sixth digit is in. A wrong or expired code shows what happened, and
 * "Didn't get a code?" asks for a new one.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pending, setPending, setMember, draft } = useSignUp();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [resending, setResending] = useState(false);
  const email = pending?.email ?? draft.email.trim().toLowerCase();

  async function verify(entered: string) {
    setChecking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { member } = await api.verifySignUp({ email, code: entered });
      setMember(member);
      router.replace("/sign-up/done");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  function onChangeCode(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(undefined);
    setNotice(undefined);
    if (digits.length === CODE_LENGTH) void verify(digits);
  }

  async function onResend() {
    if (resending) return;
    setResending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setPending(await api.resendSignUpCode({ email }));
      setCode("");
      setNotice("We sent you a new code. The old one no longer works.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 5 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <Text style={styles.title} accessibilityRole="header">
          Check your email to finish signing in
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
          <Pressable onPress={() => void onResend()} accessibilityRole="button" testID="verify-resend" hitSlop={8}>
            <Text style={styles.resend}>Didn’t get a code?</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="link" testID="verify-change-email" hitSlop={8}>
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
    lineHeight: fontSize.subheading * 0.89,
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
    paddingHorizontal: 42,
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
