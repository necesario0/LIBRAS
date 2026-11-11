import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { nameSchema, optionalNameSchema } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { TextField } from "../../src/components/TextField";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { check } from "../../src/sign-up/validate";
import { radii, spacing } from "../../src/theme/tokens";

/** Step 1 of 4, second half (Figma "iPhone 17 - 36"): the person's name. */
export default function NameScreen() {
  const router = useRouter();
  const { draft, update } = useSignUp();
  const [errors, setErrors] = useState<{ firstName?: string; middleName?: string; lastName?: string }>({});

  function onContinue() {
    const found = {
      firstName: check(nameSchema, draft.firstName),
      middleName: check(optionalNameSchema, draft.middleName),
      lastName: check(nameSchema, draft.lastName),
    };
    setErrors(found);
    if (Object.values(found).every((message) => message === undefined)) router.push("/sign-up/student");
  }

  return (
    <OnboardingScreen step={1} formGap={39}>
      <View style={styles.fields}>
        <TextField
          label="First name"
          required
          placeholder="First name"
          value={draft.firstName}
          onChangeText={(firstName) => update({ firstName })}
          error={errors.firstName}
          autoCapitalize="words"
          autoComplete="given-name"
          returnKeyType="next"
          testID="name-first"
        />
        <TextField
          label="Middle name"
          hint="(optional)"
          placeholder="Middle name"
          value={draft.middleName}
          onChangeText={(middleName) => update({ middleName })}
          error={errors.middleName}
          autoCapitalize="words"
          returnKeyType="next"
          testID="name-middle"
        />
        <TextField
          label="Last name"
          required
          placeholder="Last name"
          value={draft.lastName}
          onChangeText={(lastName) => update({ lastName })}
          error={errors.lastName}
          autoCapitalize="words"
          autoComplete="family-name"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          testID="name-last"
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="name-continue" />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
