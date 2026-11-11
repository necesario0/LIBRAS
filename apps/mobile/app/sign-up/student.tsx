import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { UMAK_COLLEGES, contactNumberSchema, studentNumberSchema, umakCollegeSchema } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { SelectField } from "../../src/components/SelectField";
import { TextField } from "../../src/components/TextField";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { check } from "../../src/sign-up/validate";
import { radii, spacing } from "../../src/theme/tokens";

/** Step 2 of 4 (Figma "iPhone 17 - 53"): what only a UMAK Student gives. */
export default function StudentScreen() {
  const router = useRouter();
  const { draft, update, fieldErrors, setFieldErrors } = useSignUp();
  const [errors, setErrors] = useState<{ studentNumber?: string; college?: string; contactNumber?: string }>({});

  function onContinue() {
    const found = {
      studentNumber: check(studentNumberSchema, draft.studentNumber),
      college: check(umakCollegeSchema, draft.college),
      contactNumber: check(contactNumberSchema, draft.contactNumber),
    };
    setErrors(found);
    if (Object.values(found).every((message) => message === undefined)) router.push("/sign-up/account");
  }

  return (
    <OnboardingScreen step={2} formGap={56}>
      <View style={styles.fields}>
        <TextField
          label="Student number"
          required
          placeholder="Student number"
          value={draft.studentNumber}
          onChangeText={(studentNumber) => {
            update({ studentNumber });
            if (fieldErrors.studentNumber !== undefined) setFieldErrors({ ...fieldErrors, studentNumber: undefined });
          }}
          error={errors.studentNumber ?? fieldErrors.studentNumber}
          autoCapitalize="characters"
          returnKeyType="next"
          testID="student-number"
        />
        <SelectField
          label="Select your college"
          required
          placeholder="Select your college"
          options={UMAK_COLLEGES}
          value={draft.college}
          onChange={(college) => update({ college })}
          error={errors.college}
          testID="student-college"
        />
        <TextField
          label="Contact number"
          placeholder="Contact number (optional)"
          value={draft.contactNumber}
          onChangeText={(contactNumber) => update({ contactNumber })}
          error={errors.contactNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          testID="student-contact"
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="student-continue" />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
