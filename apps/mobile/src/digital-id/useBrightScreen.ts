import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";
import { AppState } from "react-native";

const KEEP_AWAKE_TAG = "digital-id";

/** Brightness and keep-awake are a nicety: a phone that refuses either still shows the code. */
function ignore(): void {}

/**
 * While the calling screen is mounted and the app is in the foreground, the
 * screen stays awake at full brightness, so the desk scanner reads the Digital
 * ID the first time. Both are given back (the phone's own brightness, the
 * usual screen timeout) when the screen unmounts or the app goes to the
 * background, and taken again when it comes back.
 *
 * Only this app's window changes: Android's own brightness setting is never
 * touched, so nothing needs a permission.
 */
export function useBrightScreen(): void {
  useEffect(() => {
    const light = () => {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(ignore);
      Brightness.setBrightnessAsync(1).catch(ignore);
    };
    const restore = () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(ignore);
      Brightness.restoreSystemBrightnessAsync().catch(ignore);
    };

    if (AppState.currentState === "active") light();
    const subscription = AppState.addEventListener("change", (state) => (state === "active" ? light() : restore()));
    return () => {
      subscription.remove();
      restore();
    };
  }, []);
}
