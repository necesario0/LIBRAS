import { Stack } from "expo-router";
import { usePushNotifications } from "../../src/push/usePushNotifications";
import { colors } from "../../src/theme/tokens";

/** A link straight to a pushed screen still has the tabs under it, so back leads somewhere. */
export const unstable_settings = { initialRouteName: "(tabs)" };

/**
 * The signed-in Member's screens. The root layout only mounts this group while
 * a Member is signed in (a navigation guard, `Stack.Protected`), so nothing
 * inside needs its own sign-in check.
 *
 * At the bottom of this stack are the tabs (`(tabs)/_layout.tsx`: Home, My
 * Books, Digital ID, Profile). Every other screen here is pushed over them and
 * so covers the floating tab bar; each has its back button at the top left
 * (`PushedHeader`), and Android's back button does the same.
 *
 * It also registers the phone for push notifications and opens the screen a
 * tapped one is about (`usePushNotifications`).
 */
export default function AppLayout() {
  usePushNotifications();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
      <Stack.Screen name="(tabs)" />
      {/* A Book opens as a sheet over the screen that opened it, as in the Figma "Book detail" frame. */}
      <Stack.Screen
        name="book/[id]"
        options={{ presentation: "transparentModal", animation: "slide_from_bottom", contentStyle: { backgroundColor: "transparent" } }}
      />
    </Stack>
  );
}
