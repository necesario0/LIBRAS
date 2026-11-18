import { useState } from "react";
import { PASSWORD_CHANGE_MESSAGES } from "@libras/shared";
import { api } from "../../src/api";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { useGoBack } from "../../src/hooks/useGoBack";
import { NewPasswordForm } from "../../src/password/NewPasswordForm";
import { PasswordField } from "../../src/password/PasswordField";
import { PasswordUpdatedDialog } from "../../src/password/PasswordUpdatedDialog";

/**
 * Change password: the Figma "Change Password" frames (926:14226 to 926:14542)
 * and their success frame (928:14929). The Member types the current password
 * and a new one. A wrong current password shows the frame's red state under
 * Current Password; the API counts it like a failed sign-in, so a block ("too
 * many attempts") shows under the form. A change ends every other session of
 * the account and keeps this one, so the dialog leads back to Profile, which
 * pushed this screen, and the Member is still signed in.
 */
export default function ChangePasswordScreen() {
  const { request } = useAuth();
  const back = useGoBack();
  const [current, setCurrent] = useState("");
  const [currentError, setCurrentError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  async function save(newPassword: string) {
    try {
      await request((accessToken) => api.changePassword(accessToken, { currentPassword: current, newPassword }));
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "current_password_incorrect") {
        // The frame's red Current Password, with its own message; there is nothing more to say under the form.
        setCurrentError(PASSWORD_CHANGE_MESSAGES.currentPasswordIncorrect);
        return;
      }
      throw failure;
    }
    setDone(true);
  }

  function toProfile() {
    setDone(false);
    back();
  }

  return (
    <NewPasswordForm
      title="Change Password"
      intro="Create a strong password to keep your Libras account secure."
      submitLabel="Save changes"
      leadingFields={
        <PasswordField
          label="Current Password"
          placeholder="Enter current password"
          value={current}
          onChangeText={(text) => {
            setCurrent(text);
            setCurrentError(undefined);
          }}
          error={currentError}
          autoComplete="current-password"
          testID="current-password"
        />
      }
      extraRequirements={(newPassword) => [
        { label: "Different from your current password", met: newPassword.length > 0 && newPassword !== current },
      ]}
      ready={current.length > 0}
      onSubmit={save}
      onBack={back}
      onCancel={back}
    >
      <PasswordUpdatedDialog
        visible={done}
        message="Your password has been changed. Every other device was signed out; this one stays signed in."
        actionLabel="Back to Profile"
        onAction={toProfile}
      />
    </NewPasswordForm>
  );
}
