import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { VISITOR_ID_TYPES, requiredContactNumberSchema, visitorDetailsSchema } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { SelectField } from "../../src/components/SelectField";
import { TextField } from "../../src/components/TextField";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { check } from "../../src/sign-up/validate";
import { radii, spacing } from "../../src/theme/tokens";

/**
 * Step 2 of 4 (Figma "iPhone 17 - 277" to "298"): what only a Visitor gives. The
 * contact number is required here, unlike the other Account Types.
 */
export default function VisitorScreen() {
  const router = useRouter();
  const { draft, update } = useSignUp();
  const [errors, setErrors] = useState<{ validIdNumber?: string; institution?: string; contactNumber?: string }>({});

  function onContinue() {
    const found = {
      validIdNumber: check(visitorDetailsSchema.shape.validIdNumber, draft.validIdNumber),
      institution: check(visitorDetailsSchema.shape.institution, draft.institution),
      contactNumber: check(requiredContactNumberSchema, draft.contactNumber),
    };
    setErrors(found);
    if (Object.values(found).every((message) => message === undefined)) router.push("/sign-up/account");
  }

  return (
    <OnboardingScreen step={2} formGap={56}>
      <View style={styles.fields}>
        <TextField
          label="Valid ID number"
          required
          placeholder="Valid ID number"
          value={draft.validIdNumber}
          onChangeText={(validIdNumber) => update({ validIdNumber })}
          error={errors.validIdNumber}
          autoCapitalize="characters"
          returnKeyType="next"
          testID="visitor-id-number"
        />
        <SelectField
          label="Type of Identification"
          placeholder="Select ID type"
          options={VISITOR_ID_TYPES}
          value={draft.idType}
          onChange={(idType) => update({ idType })}
          testID="visitor-id-type"
        />
        <TextField
          label="University/Institution Name"
          required
          placeholder="Enter your school or institution name"
          value={draft.institution}
          onChangeText={(institution) => update({ institution })}
          error={errors.institution}
          autoCapitalize="words"
          returnKeyType="next"
          testID="visitor-institution"
        />
        <TextField
          label="Contact number"
          required
          placeholder="Contact number"
          value={draft.contactNumber}
          onChangeText={(contactNumber) => update({ contactNumber })}
          error={errors.contactNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          testID="visitor-contact"
        />
      </View>
      <Button label="Continue" radius={radii.formButton} onPress={onContinue} testID="visitor-continue" />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.xs + 1 },
});
