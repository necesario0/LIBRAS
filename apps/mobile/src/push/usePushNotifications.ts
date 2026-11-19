import { pushDestination } from "@libras/shared";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { pushAvailable, pushTokenOfThisPhone } from "./push-device";

/**
 * Push notifications for the signed-in Member. Mount it once, in the signed-in
 * part of the app.
 *
 * - Registers this phone with the API on every start (a token can change), asking
 *   for Android's permission the first time; a registration that fails is tried
 *   again on the next start. Signing out unregisters it (`AuthContext`).
 * - A tapped push notification opens the screen it is about: My Books on Holds
 *   or Loans, or the Announcement. One tapped while the app was closed opens it
 *   once the Member is signed in.
 *
 * In a build that cannot get push notifications (`pushAvailable` is false) it does nothing.
 */
export function usePushNotifications(): void {
  const { request } = useAuth();
  const router = useRouter();
  // The latest `request`, so a new one (the session changed) does not register the phone again.
  const requestRef = useRef(request);
  requestRef.current = request;
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!pushAvailable) return;
    let live = true;
    const register = async (ask: boolean) => {
      const token = await pushTokenOfThisPhone({ ask });
      if (token === undefined || !live) return;
      try {
        await requestRef.current((accessToken) => api.registerPushDevice(accessToken, token));
      } catch {
        // Offline or the API is down: the next start registers again.
      }
    };
    void register(true);
    // Firebase can hand the phone a new token while the app runs.
    const subscription = Notifications.addPushTokenListener(() => void register(false));
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pushAvailable || !lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const destination = pushDestination(lastResponse.notification.request.content.data);
    // Handled once: a later start, or a return to this screen, does not open it again.
    Notifications.clearLastNotificationResponse();
    if (destination === undefined) return;
    if (destination.screen === "announcement") router.push("/announcement");
    else if (destination.segment === "holds") router.navigate("/my-books?segment=holds");
    else router.navigate("/my-books?segment=loans");
  }, [lastResponse, router]);
}
