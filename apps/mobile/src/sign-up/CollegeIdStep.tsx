import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { UMAK_COLLEGES, contactNumberSchema, umakCollegeSchema } from "@libras/shared";
import { Button } from "../components/Button";
import { OnboardingScreen } from "../components/OnboardingScreen";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import { radii, spacing } from "../theme/tokens";
import { useSignUp } from "./SignUpContext";
import { check } from "./validate";

interface Schema {
  safeParse(value: unknown): { success: true } | { success: false; error: { issues: readonly { message: string }[] } };
}

interface CollegeIdStepProps {
  /** The ID number: Student number, Faculty number or Employee number. */
  idLabel: string;
  idValue: string;
  onIdChange: (value: string) => void;
  idSchema: Schema;
  /** A refusal from the API that belongs to this field, such as a student number that is taken. */
  idServerError?: string | undefined;
  idCapitalize?: "none" | "characters";
  /** Prefix of the test ids: `<prefix>-number`, `-college`, `-contact` and `-continue`. */
  testPrefix: string;
}

/**
 * Step 2 of 4 for the three Account Types that belong to the university
 * (Figma "iPhone 17 - 53" for a UMAK Student, "207" for Faculty and "241" for
 * NTP / Employee): an ID number, the college and an optional contact number.
 */
export function CollegeIdStep({
  idLabel,
  idValue,
  onIdChange,
  idSchema,
  idServerError,
  idCapitalize = "none",
  testPrefix,
}: CollegeIdStepProps) {
  const router = useRouter();
  const { draft, update } = useSignUp();
  const [errors, setErrors] = useState<{ id?: string; college?: string; contactNumber?: string }>({});

  function onContinue() {
    const found = {
      id: check(idSchema, idValue),
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
          label={idLabel}
          required
          placeholder={idLabel}
          value={idValue}
          onChangeText={onIdChange}
          error={errors.id ?? idServerError}
          autoCapitalize={idCapitalize}
          returnKeyType="next"
          testID={`${testPrefix}-number`}
        />
        <SelectField
          label="Select your college"
          required
          placeholder="Select your college"
          options={UMAK_COLLEGES}
          value={draft.college}
          onChange={(college) => update({ college })}
          error={errors.college}
          testID={`${testPrefix}-college`}
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
          testID={`${testPrefix}-contact`}
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID={`${testPrefix}-continue`} />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
