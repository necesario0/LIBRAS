import { Stack } from "expo-router";
import { ForgotPasswordProvider } from "../../src/password/ForgotPasswordContext";
import { colors } from "../../src/theme/tokens";

/** Forgot password: email, code, new password. Its state is forgotten when the flow is left. */
export default function ForgotPasswordLayout() {
  return (
    <ForgotPasswordProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }} />
    </ForgotPasswordProvider>
  );
}
