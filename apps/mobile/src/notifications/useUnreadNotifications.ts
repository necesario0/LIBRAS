import { useFocusEffect, useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

/**
 * How many of the Member's Notifications are unread, for the badge on the Home
 * bell. It is read again whenever the screen comes into view and whenever the
 * app returns to the foreground while the screen shows; there is no polling. A
 * failed read keeps the count already shown (zero at first: no badge).
 */
export function useUnreadNotifications(): number {
  const { request } = useAuth();
  const [unread, setUnread] = useState(0);
  const requestRef = useRef(request);
  requestRef.current = request;
  const latest = useRef(0);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try {
      const body = await requestRef.current((accessToken) => api.getUnreadNotifications(accessToken));
      if (id === latest.current) setUnread(body.unread);
    } catch {
      // Offline or the API is down: the next visit or return to the app reads it again.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active" && focusedRef.current) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return unread;
}
