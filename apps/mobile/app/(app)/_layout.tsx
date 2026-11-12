import { Stack } from "expo-router";
import { colors } from "../../src/theme/tokens";

/**
 * The signed-in Member's screens. The root layout only mounts this group while
 * a Member is signed in (a navigation guard, `Stack.Protected`), so nothing
 * inside needs its own sign-in check.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
      {/* A Book opens as a sheet over the screen that opened it, as in the Figma "Book detail" frame. */}
      <Stack.Screen
        name="book/[id]"
        options={{ presentation: "transparentModal", animation: "slide_from_bottom", contentStyle: { backgroundColor: "transparent" } }}
      />
    </Stack>
  );
}
