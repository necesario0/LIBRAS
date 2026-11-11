import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SIGN_UP_MESSAGES, passwordSchema, usernameSchema } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { TextField } from "../../src/components/TextField";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { check } from "../../src/sign-up/validate";
import { radii, spacing } from "../../src/theme/tokens";

/** Step 3 of 4 (Figma "iPhone 17 - 99" and "104"): a username and a password. */
export default function AccountScreen() {
  const router = useRouter();
  const { draft, update, fieldErrors, setFieldErrors } = useSignUp();
  const [errors, setErrors] = useState<{ username?: string; password?: string; confirmPassword?: string }>({});

  function onContinue() {
    const found = {
      username: check(usernameSchema, draft.username),
      password: check(passwordSchema, draft.password),
      confirmPassword:
        draft.confirmPassword === draft.password ? undefined : SIGN_UP_MESSAGES.passwordsDiffer,
    };
    setErrors(found);
    if (Object.values(found).every((message) => message === undefined)) router.push("/sign-up/email");
  }

  return (
    <OnboardingScreen step={3} formGap={22}>
      <View style={styles.fields}>
        <TextField
          label="Username"
          required
          placeholder="Username"
          value={draft.username}
          onChangeText={(username) => {
            update({ username });
            if (fieldErrors.username !== undefined) setFieldErrors({ ...fieldErrors, username: undefined });
          }}
          error={errors.username ?? fieldErrors.username}
          returnKeyType="next"
          testID="account-username"
        />
        <TextField
          label="Password"
          required
          placeholder="Password"
          value={draft.password}
          onChangeText={(password) => update({ password })}
          error={errors.password}
          secure
          revealable
          autoComplete="new-password"
          returnKeyType="next"
          testID="account-password"
        />
        <TextField
          label="Confirm Password"
          required
          placeholder="Confirm Password"
          value={draft.confirmPassword}
          onChangeText={(confirmPassword) => update({ confirmPassword })}
          error={errors.confirmPassword}
          secure
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          testID="account-confirm-password"
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="account-continue" />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
