import { useRef, useState } from "react";
import type { ComponentRef, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SIGN_UP_MESSAGES, passwordSchema } from "@libras/shared";
import { BackButton } from "../account/BackButton";
import { KeyboardAvoiding } from "../components/KeyboardAvoiding";
import { FieldError } from "../components/TextField";
import { RequirementMetIcon, RequirementUnmetIcon } from "../components/icons";
import { useScreenTop } from "../hooks/useScreenTop";
import { PasswordField } from "./PasswordField";
import { check } from "../sign-up/validate";
import { colors, fontFamily, fontSize, passwordActionHeight, radii, spacing } from "../theme/tokens";

/** One line of the requirements list under the fields (Figma 926:14364). */
export interface PasswordRequirement {
  label: string;
  met: boolean;
}

/** The smallest number of characters a password may have: the sign-up rule. */
const MIN_PASSWORD_LENGTH = 8;

interface NewPasswordFormProps {
  title: string;
  intro: string;
  /** Fields above New Password, such as Change password's Current Password. */
  leadingFields?: ReactNode;
  /** Requirements beyond the sign-up rules for the new password typed so far, listed after them. */
  extraRequirements?: (newPassword: string) => readonly PasswordRequirement[];
  /** False while a leading field still needs filling in. Default true. */
  ready?: boolean;
  submitLabel: string;
  /** Saves the new password. Throws, with a message for the person, when it is refused. */
  onSubmit: (newPassword: string) => Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  /** Shown under the form, for example the success dialog. */
  children?: ReactNode;
}

/**
 * The new-password form of the Change password frames (Figma 926:14226 to
 * 926:14542): a back button and title, an intro line, New Password and Confirm
 * New Password, the requirements they must meet, then Cancel and Save. Save
 * stays dimmed until every requirement is met.
 *
 * The requirements are the sign-up rules (`passwordSchema`): at least 8
 * characters, and the two fields the same. The frames also show a strength meter
 * and "Contains a letter and a number": neither is a sign-up rule, so neither is
 * shown, and the API would not enforce them. Forgot password uses it as it is;
 * Change password adds Current Password with `leadingFields`.
 */
export function NewPasswordForm({
  title,
  intro,
  leadingFields,
  extraRequirements,
  ready = true,
  submitLabel,
  onSubmit,
  onBack,
  onCancel,
  children,
}: NewPasswordFormProps) {
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const confirmInput = useRef<ComponentRef<typeof TextInput>>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmationError, setConfirmationError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const requirements: PasswordRequirement[] = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { label: "Both passwords match", met: password.length > 0 && password === confirmation },
    ...(extraRequirements?.(password) ?? []),
  ];
  const savable = ready && requirements.every((requirement) => requirement.met) && !saving;

  async function save() {
    if (!savable) return;
    const problem = check(passwordSchema, password);
    if (problem !== undefined) return setPasswordError(problem);
    if (password !== confirmation) return setConfirmationError(SIGN_UP_MESSAGES.passwordsDiffer);
    setSaving(true);
    setFormError(undefined);
    try {
      await onSubmit(password);
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoiding style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop + 54, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <View style={styles.titleRow}>
            <BackButton onPress={onBack} testID="password-back" />
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
              {title}
            </Text>
          </View>
          <Text style={styles.intro}>{intro}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fields}>
            {leadingFields}
            <PasswordField
              label="New Password"
              placeholder="Enter new password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(undefined);
                setFormError(undefined);
              }}
              error={passwordError}
              returnKeyType="next"
              onSubmitEditing={() => confirmInput.current?.focus()}
              testID="new-password"
            />
            <PasswordField
              label="Confirm New Password"
              placeholder="Re-enter new password"
              value={confirmation}
              onChangeText={(text) => {
                setConfirmation(text);
                setConfirmationError(undefined);
                setFormError(undefined);
              }}
              error={confirmationError}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              inputRef={confirmInput}
              testID="confirm-password"
            />
          </View>
          <View style={styles.requirements} testID="password-requirements">
            {requirements.map((requirement) => (
              <View key={requirement.label} style={styles.requirement} accessibilityLabel={`${requirement.label}: ${requirement.met ? "met" : "not met"}`}>
                {requirement.met ? <RequirementMetIcon /> : <RequirementUnmetIcon />}
                <Text style={[styles.requirementLabel, requirement.met && styles.requirementMet]}>{requirement.label}</Text>
              </View>
            ))}
          </View>
          <FieldError message={formError} testID="password-error" />
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.action, styles.cancel]} testID="password-cancel">
            <Text style={[styles.actionLabel, styles.cancelLabel]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !savable, busy: saving }}
            onPress={savable ? () => void save() : undefined}
            style={[styles.action, styles.save, !savable && styles.saveDisabled]}
            testID="password-save"
          >
            <Text style={styles.actionLabel}>{saving ? "Saving..." : submitLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {children}
    </KeyboardAvoiding>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl },
  heading: { gap: 18 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.headline, lineHeight: 38, color: colors.ink },
  intro: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 17, color: colors.textSubtle, maxWidth: 288 },
  form: { marginTop: 31, gap: 16 },
  fields: { gap: 14 },
  requirements: { gap: spacing.sm },
  requirement: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  requirementLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 17, color: colors.textSubtle },
  requirementMet: { color: colors.ink },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: "auto", paddingTop: 48 },
  action: { flex: 1, height: passwordActionHeight, borderRadius: radii.passwordAction, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cancel },
  save: { backgroundColor: colors.save },
  saveDisabled: { opacity: 0.45 },
  actionLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.ink },
  cancelLabel: { color: colors.cancel },
});
