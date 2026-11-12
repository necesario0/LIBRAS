import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono";
import {
  Montserrat_200ExtraLight,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { RobotoMono_400Regular } from "@expo-google-fonts/roboto-mono";
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
    IBMPlexMono_400Regular,
    Montserrat_200ExtraLight,
    RobotoMono_400Regular,
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
 * - sign-in and sign-up: only while signed out.
 * - the root route, terms and status: always. The root route sends a signed-in
 *   Member to `/home` and shows the welcome screen to everyone else.
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
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Screen name="terms" />
      <Stack.Screen name="status" />
    </Stack>
  );
}
