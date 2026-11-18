import { useRouter } from "expo-router";
import { useState } from "react";
import { api } from "../../src/api";
import { NewPasswordForm } from "../../src/password/NewPasswordForm";
import { PasswordUpdatedDialog } from "../../src/password/PasswordUpdatedDialog";
import { useForgotPassword } from "../../src/password/ForgotPasswordContext";

/**
 * The last step of Forgot password, with no Figma frame of its own: the Change
 * password form without Current Password, and its success dialog. The reset
 * signs every device out and does not sign this one in, so the dialog leads to
 * sign-in, where the Member tries the new password.
 */
export default function ForgotPasswordNewPasswordScreen() {
  const router = useRouter();
  const { email, code } = useForgotPassword();
  const [done, setDone] = useState(false);

  function toSignIn() {
    setDone(false);
    router.dismissTo("/sign-in");
  }

  return (
    <NewPasswordForm
      title="New Password"
      intro="Create a strong password to keep your Libras account secure."
      submitLabel="Save password"
      onSubmit={async (password) => {
        await api.completePasswordReset({ email, code, password });
        setDone(true);
      }}
      onBack={() => router.back()}
      onCancel={() => router.dismissTo("/sign-in")}
    >
      <PasswordUpdatedDialog
        visible={done}
        message="Your password has been changed and every device was signed out. Sign in with your new password."
        actionLabel="Back to sign in"
        onAction={toSignIn}
      />
    </NewPasswordForm>
  );
}
