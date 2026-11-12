import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ALUMNI_GRADUATION_YEARS, alumniDetailsSchema, contactNumberSchema, yearGraduatedSchema } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { SelectField } from "../../src/components/SelectField";
import { TextField } from "../../src/components/TextField";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { check } from "../../src/sign-up/validate";
import { radii, spacing } from "../../src/theme/tokens";

/** Step 2 of 4 (Figma "iPhone 17 - 341" to "362"): what only an Alumni gives. */
export default function AlumniScreen() {
  const router = useRouter();
  const { draft, update } = useSignUp();
  const [errors, setErrors] = useState<{ yearGraduated?: string; alumniIdNumber?: string; contactNumber?: string }>({});

  function onContinue() {
    const found = {
      yearGraduated: check(yearGraduatedSchema, draft.yearGraduated),
      alumniIdNumber: check(alumniDetailsSchema.shape.alumniIdNumber, draft.alumniIdNumber),
      contactNumber: check(contactNumberSchema, draft.contactNumber),
    };
    setErrors(found);
    if (Object.values(found).every((message) => message === undefined)) router.push("/sign-up/account");
  }

  return (
    <OnboardingScreen step={2} formGap={56}>
      <View style={styles.fields}>
        <SelectField
          label="Year graduated"
          required
          placeholder="Select year graduated"
          options={ALUMNI_GRADUATION_YEARS}
          value={draft.yearGraduated}
          onChange={(yearGraduated) => update({ yearGraduated })}
          error={errors.yearGraduated}
          testID="alumni-year"
        />
        <TextField
          label="Alumni ID number"
          required
          placeholder="Alumni ID number"
          value={draft.alumniIdNumber}
          onChangeText={(alumniIdNumber) => update({ alumniIdNumber })}
          error={errors.alumniIdNumber}
          returnKeyType="next"
          testID="alumni-id-number"
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
          testID="alumni-contact"
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="alumni-continue" />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
