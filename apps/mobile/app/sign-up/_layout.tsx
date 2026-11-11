import { Stack } from "expo-router";
import { colors } from "../../src/theme/tokens";
import { SignUpProvider } from "../../src/sign-up/SignUpContext";

/** The sign-up flow: one draft shared by every step, forgotten when the flow is left. */
export default function SignUpLayout() {
  return (
    <SignUpProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }} />
    </SignUpProvider>
  );
}
