import { useSafeAreaInsets } from "react-native-safe-area-context";
import { statusBarHeight } from "../theme/tokens";

/**
 * How far down the content of a screen starts. The Figma frames reserve 62 pt
 * for the iPhone status bar and position everything from there; an Android
 * status bar is shorter, so the design's space is kept, never less.
 */
export function useScreenTop(): number {
  const { top } = useSafeAreaInsets();
  return Math.max(top, statusBarHeight);
}
