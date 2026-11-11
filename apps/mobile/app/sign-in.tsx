import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import type { ComponentRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import { emailSchema } from "@libras/shared";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";
import { BookIllustration } from "../src/components/BookIllustration";
import { Button } from "../src/components/Button";
import { KeyboardAvoiding } from "../src/components/KeyboardAvoiding";
import { FieldError, TextField } from "../src/components/TextField";
import { Wordmark } from "../src/components/Wordmark";
import { useScreenTop } from "../src/hooks/useScreenTop";
import { check } from "../src/sign-up/validate";
import { colors, fontFamily, fontSize, spacing } from "../src/theme/tokens";

/**
 * "Login with account" (Figma "iPhone 17 - 9", error states 13, 14 and 96): the
 * wordmark, the book, the tagline, then email, password and Continue.
 *
 * Deliberate differences from the frames: no "forgot password?" link (password
 * reset is out of scope for Tier 1); the error frames swap the tagline for the
 * university's name, which here stays the tagline so the layout does not jump
 * when an error appears. A wrong email or password marks both fields and says
 * "The email or password is incorrect", never which one.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const screenTop = useScreenTop();
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function clearErrors() {
    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);
  }

  async function onContinue() {
    if (submitting) return;
    clearErrors();
    const trimmed = email.trim();
    const emailProblem = trimmed === "" ? "Enter your email address." : check(emailSchema, trimmed);
    const passwordProblem = password === "" ? "Enter your password." : undefined;
    if (emailProblem !== undefined || passwordProblem !== undefined) {
      setEmailError(emailProblem);
      setPasswordError(passwordProblem);
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email: trimmed, password });
      // The navigation guard now shows the signed-in screens.
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "email_not_verified") {
        // The password was right but sign-up was never finished: carry on at the code step.
        router.push({ pathname: "/sign-up/verify", params: { email: trimmed.toLowerCase() } });
      } else {
        setFormError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.book}>
          <BookIllustration width={292} height={197} />
        </View>
        <Text style={styles.tagline} accessibilityRole="header">
          The library for problem solver
        </Text>
        <View style={styles.form}>
          <TextField
            bare
            label="Email"
            placeholder="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              clearErrors();
            }}
            error={emailError}
            invalid={formError !== undefined}
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
            testID="sign-in-email"
          />
          <TextField
            bare
            secure
            revealable
            label="Password"
            placeholder="password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              clearErrors();
            }}
            error={passwordError}
            invalid={formError !== undefined}
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={() => void onContinue()}
            inputRef={passwordInput}
            testID="sign-in-password"
          />
          <FieldError message={formError} testID="sign-in-error" />
          <Button label="Continue" onPress={() => void onContinue()} loading={submitting} testID="sign-in-continue" />
        </View>
      </ScrollView>
    </KeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, alignItems: "center", paddingBottom: spacing.xl },
  book: { marginTop: 1 },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.hero,
    color: colors.black,
    textAlign: "center",
    marginTop: -15,
    paddingHorizontal: spacing.screen,
  },
  form: { alignSelf: "stretch", paddingHorizontal: spacing.screen, marginTop: spacing.md, gap: spacing.sm },
});
