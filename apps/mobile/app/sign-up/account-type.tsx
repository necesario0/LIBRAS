import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@libras/shared";
import { Button } from "../../src/components/Button";
import { OnboardingScreen } from "../../src/components/OnboardingScreen";
import { OptionRow } from "../../src/components/OptionRow";
import { useSignUp } from "../../src/sign-up/SignUpContext";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/** Step 1 of 4, first half (Figma "iPhone 17 - 107"): which kind of Member the person is. */
export default function AccountTypeScreen() {
  const router = useRouter();
  const { draft, update } = useSignUp();

  return (
    <OnboardingScreen step={1} formGap={34}>
      <View style={styles.selection}>
        <Text style={styles.title}>Select your account type</Text>
        <View style={styles.list} accessibilityRole="radiogroup">
          {ACCOUNT_TYPES.map((type) => (
            <OptionRow
              key={type}
              label={ACCOUNT_TYPE_LABELS[type]}
              selected={draft.accountType === type}
              onPress={() => update({ accountType: type })}
              testID={`account-type-${type}`}
            />
          ))}
        </View>
        <Button
          label="Continue"
          radius={radii.option}
          onPress={() => router.push("/sign-up/name")}
          testID="account-type-continue"
        />
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  selection: { gap: spacing.md, marginHorizontal: 3 },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.subheading, color: colors.link },
  list: { gap: spacing.xs },
});
