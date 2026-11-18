import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api";
import { CodeEntryScreen } from "../../src/components/CodeEntryScreen";
import { useSignUp } from "../../src/sign-up/SignUpContext";

/**
 * "Check your email to finish signing in" (Figma "iPhone 17 - 227" to "231"):
 * the person types the 6-digit code from the email. A wrong or expired code
 * shows what happened, and "Didn't get a code?" asks for a new one.
 *
 * Sign-in also leads here, with `?email=`, when the password was right but the
 * email was never verified: the code from sign-up may be gone or expired, so
 * the screen says so and "Didn't get a code?" is the way out.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const { pending, setPending, setMember, draft } = useSignUp();
  const { email: emailFromSignIn } = useLocalSearchParams<{ email?: string }>();
  const email = pending?.email ?? emailFromSignIn ?? draft.email.trim().toLowerCase();

  return (
    <CodeEntryScreen
      title="Check your email to finish signing in"
      email={email}
      initialNotice={
        emailFromSignIn === undefined
          ? undefined
          : "Your email is not verified yet. Enter the code we emailed you, or ask for a new one."
      }
      onSubmit={async (code) => {
        const { member } = await api.verifySignUp({ email, code });
        setMember(member);
        router.replace("/sign-up/done");
      }}
      onResend={async () => {
        setPending(await api.resendSignUpCode({ email }));
        return "We sent you a new code. The old one no longer works.";
      }}
      resendLabel="Didn’t get a code?"
      onChangeEmail={() => router.back()}
    />
  );
}
