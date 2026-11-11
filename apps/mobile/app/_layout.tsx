import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { StartupError } from "../src/auth/StartupError";
import { colors } from "../src/theme/tokens";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });
  const fontsReady = fontsLoaded || fontError !== null;

  if (!fontsReady) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Navigator />
    </AuthProvider>
  );
}

/**
 * The navigation guard. Screens are grouped by who may see them:
 * - `(app)`: the signed-in Member's screens. Reachable only while signed in;
 *   signing out (or a session that cannot be renewed) removes them from the
 *   navigator and sends the Member to the welcome screen, and a link to one of
 *   them while signed out goes nowhere.
 * - welcome, sign-in and sign-up: only while signed out.
 * - terms and status: always.
 * While the stored session is being checked at launch the splash screen stays up.
 */
function Navigator() {
  const { state, retry } = useAuth();
  const restoring = state.status === "restoring";
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (!restoring) void SplashScreen.hideAsync();
  }, [restoring]);

  if (restoring) return null;
  if (state.status === "unavailable") return <StartupError message={state.message} onRetry={retry} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Screen name="terms" />
      <Stack.Screen name="status" />
    </Stack>
  );
}
