import { useRouter } from "expo-router";

/**
 * Goes back to the screen that opened this one, or to Home when there is none
 * (the screen was opened by a link, or the app was restored onto it).
 */
export function useGoBack(): () => void {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace("/home"));
}
