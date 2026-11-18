import { useRouter } from "expo-router";
import { api } from "../../src/api";
import { CodeEntryScreen } from "../../src/components/CodeEntryScreen";
import { useForgotPassword } from "../../src/password/ForgotPasswordContext";

/**
 * The code step of Forgot password: the sign-up code entry, reused. A correct
 * code leads to the new password; a wrong or expired one says so, and "Send a
 * new code" emails another.
 */
export default function ForgotPasswordVerifyScreen() {
  const router = useRouter();
  const { email, setCode } = useForgotPassword();

  return (
    <CodeEntryScreen
      title="Check your email to reset your password"
      email={email}
      onSubmit={async (code) => {
        await api.checkPasswordResetCode({ email, code });
        setCode(code);
        router.push("/forgot-password/new-password");
      }}
      onResend={async () => {
        await api.requestPasswordReset({ email });
        return "If this email has a LIBRAS account, we sent it a new code. The old one no longer works.";
      }}
      resendLabel="Didn’t get a code? Send a new code"
      onChangeEmail={() => router.back()}
    />
  );
}
