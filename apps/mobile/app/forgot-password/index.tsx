import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { emailSchema } from "@libras/shared";
import { api } from "../../src/api";
import { BookIllustration } from "../../src/components/BookIllustration";
import { Button } from "../../src/components/Button";
import { KeyboardAvoiding } from "../../src/components/KeyboardAvoiding";
import { TextField } from "../../src/components/TextField";
import { Wordmark } from "../../src/components/Wordmark";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { useForgotPassword } from "../../src/password/ForgotPasswordContext";
import { check } from "../../src/sign-up/validate";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * The first step of Forgot password, opened from "Forgot password?" on
 * sign-in. There is no Figma frame: it is built like the sign-up email step
 * (Figma "iPhone 17 - 201"), with the wordmark, the book, a title, the email
 * field and Continue. The API answers the same for every email, so the next
 * screen never says whether the email has an account.
 */
export default function ForgotPasswordEmailScreen() {
  const router = useRouter();
  const screenTop = useScreenTop();
  const { email: emailFromSignIn } = useLocalSearchParams<{ email?: string }>();
  const { email, setEmail } = useForgotPassword();
  const [typed, setTyped] = useState(email === "" ? (emailFromSignIn ?? "") : email);
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  async function onContinue() {
    if (sending) return;
    const trimmed = typed.trim();
    const problem = trimmed === "" ? "Enter your email address." : check(emailSchema, trimmed);
    setError(problem);
    if (problem !== undefined) return;

    setSending(true);
    try {
      const { email: sentTo } = await api.requestPasswordReset({ email: trimmed });
      setEmail(sentTo);
      router.push("/forgot-password/verify");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 18 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.book}>
          <BookIllustration width={173} height={117} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Forgot your password?
        </Text>
        <Text style={styles.message}>
          Enter the email of your LIBRAS account. We will email you a code to set a new password.
        </Text>
        <View style={styles.form}>
          <TextField
            label="Enter email"
            labelSize={fontSize.body}
            placeholder="Enter your email"
            value={typed}
            onChangeText={(text) => {
              setTyped(text);
              setError(undefined);
            }}
            error={error}
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={() => void onContinue()}
            testID="forgot-password-email"
          />
          <Button
            label="Send code"
            radius={radii.formButton}
            onPress={() => void onContinue()}
            loading={sending}
            testID="forgot-password-continue"
          />
          <Pressable onPress={() => router.back()} accessibilityRole="link" hitSlop={8} testID="forgot-password-back">
            <Text style={styles.back}>Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, alignItems: "center", paddingBottom: spacing.xl },
  book: { marginTop: 17 },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.title,
    color: colors.black,
    textAlign: "center",
    marginTop: spacing.lg,
    paddingHorizontal: spacing.screen,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 320,
    paddingHorizontal: spacing.screen,
  },
  form: { alignSelf: "stretch", paddingHorizontal: 22, marginTop: spacing.xxl, gap: spacing.xl },
  back: { fontFamily: fontFamily.regular, fontSize: fontSize.body, color: colors.textMuted, textAlign: "center" },
});
