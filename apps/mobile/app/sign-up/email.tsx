import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { SIGN_UP_MESSAGES, emailSchema, isUmakEmail, requiresUmakEmail } from "@libras/shared";
import { api } from "../../src/api";
import { ApiError } from "../../src/api/client";
import { BookIllustration } from "../../src/components/BookIllustration";
import { Button } from "../../src/components/Button";
import { CheckIcon } from "../../src/components/icons";
import { ConsentText } from "../../src/components/ConsentText";
import { KeyboardAvoiding } from "../../src/components/KeyboardAvoiding";
import { useKeyboardVisible } from "../../src/components/OnboardingScreen";
import { StepProgress } from "../../src/components/StepProgress";
import { FieldError, TextField } from "../../src/components/TextField";
import { Wordmark } from "../../src/components/Wordmark";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { DETAILS_ROUTE, buildSignUpRequest } from "../../src/sign-up/request";
import { check } from "../../src/sign-up/validate";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/** The server errors that belong to a field on an earlier step, and the step to go back to. */
const EARLIER_STEP = {
  username_taken: { field: "username", route: "/sign-up/account" },
  student_number_taken: { field: "studentNumber", route: "/sign-up/student" },
} as const;

/**
 * Step 4 of 4 (Figma "iPhone 17 - 201"): the email address. Continuing sends the
 * sign-up to the API, which emails a verification code. The terms are accepted
 * here with a tick before the account can be created.
 */
export default function EmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const keyboardVisible = useKeyboardVisible();
  const scroll = useRef<ScrollViewInstance>(null);
  const { draft, update, setPending, setFieldErrors } = useSignUp();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [termsError, setTermsError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  // With the keyboard up, bring the checkbox and Continue into view above it.
  useEffect(() => {
    if (keyboardVisible) scroll.current?.scrollToEnd({ animated: true });
  }, [keyboardVisible]);

  async function onContinue() {
    if (sending) return;
    const emailProblem =
      check(emailSchema, draft.email) ??
      (requiresUmakEmail(draft.accountType) && !isUmakEmail(draft.email.trim())
        ? SIGN_UP_MESSAGES.umakEmailRequired
        : undefined);
    const termsProblem = draft.acceptedTerms ? undefined : SIGN_UP_MESSAGES.termsRequired;
    setEmailError(emailProblem);
    setTermsError(termsProblem);
    if (emailProblem !== undefined || termsProblem !== undefined) return;
    const request = buildSignUpRequest(draft);
    if (request === undefined) return router.navigate(DETAILS_ROUTE[draft.accountType]);

    setSending(true);
    try {
      const pending = await api.signUp(request);
      setPending(pending);
      router.push("/sign-up/verify");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      const earlier = error instanceof ApiError ? EARLIER_STEP[error.code as keyof typeof EARLIER_STEP] : undefined;
      if (earlier === undefined) {
        setEmailError(message);
      } else {
        setFieldErrors({ [earlier.field]: message });
        router.navigate(earlier.route);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 18 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <View style={styles.book}>
          <BookIllustration width={173} height={117} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Almost finished, just a little more
        </Text>
        <View style={styles.form}>
          <TextField
            label="Enter email"
            labelSize={fontSize.body}
            required
            placeholder="Enter your email"
            value={draft.email}
            onChangeText={(email) => {
              update({ email });
              setEmailError(undefined);
            }}
            error={emailError}
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={() => void onContinue()}
            testID="email-input"
          />
          <TermsCheckbox
            checked={draft.acceptedTerms}
            onToggle={() => {
              update({ acceptedTerms: !draft.acceptedTerms });
              setTermsError(undefined);
            }}
            error={termsError}
          />
          <Button
            label="Continue"
            radius={radii.formButton}
            onPress={() => void onContinue()}
            loading={sending}
            testID="email-continue"
          />
        </View>
      </ScrollView>
      {keyboardVisible ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 25 }]}>
          <View style={styles.progress}>
            <StepProgress step={4} />
          </View>
          <ConsentText />
        </View>
      )}
    </KeyboardAvoiding>
  );
}

/** The tick that accepts the terms. Not in the Figma frames: the design only says "by continuing". */
function TermsCheckbox({ checked, onToggle, error }: { checked: boolean; onToggle: () => void; error: string | undefined }) {
  const router = useRouter();
  return (
    <View style={styles.terms}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Accept the terms"
        onPress={onToggle}
        hitSlop={8}
        testID="email-accept-terms"
        style={[styles.box, checked && styles.boxChecked]}
      >
        {checked ? <CheckIcon /> : null}
      </Pressable>
      <Text style={styles.termsText}>
        {"I have read and accept the "}
        <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push("/terms")}>
          Consumer Terms and Usage Policy
        </Text>
        {", and acknowledge the Privacy policy."}
      </Text>
      <FieldError message={error} testID="email-accept-terms-error" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, alignItems: "center", paddingBottom: spacing.lg },
  book: { marginTop: 17 },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.display,
    color: colors.black,
    textAlign: "center",
    width: 347,
    maxWidth: "100%",
    marginTop: spacing.sm,
  },
  form: { alignSelf: "stretch", paddingHorizontal: 22, marginTop: 38, gap: spacing.xl },
  terms: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md },
  box: {
    width: 24,
    height: 24,
    borderRadius: radii.checkbox,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.small, color: colors.textMuted },
  termsLink: { color: colors.black, textDecorationLine: "underline" },
  footer: { gap: spacing.xl + spacing.sm },
  progress: { marginHorizontal: 37 },
});
