import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * This phone and push notifications. A push notification reaches the phone
 * through Expo's push service and Firebase Cloud Messaging, which needs a build
 * made with the Firebase credentials (`google-services.json`) and the Expo
 * project id (`app.config.ts` sets `extra.pushEnabled` only then). In any other
 * build (the emulator test builds, a build before the owner set Firebase up)
 * nothing here asks for permission or registers, and the app works as before.
 */

/** The Android notification channel the API names in every push (`ANDROID_CHANNEL_ID` in the API). */
const CHANNEL_ID = "default";

interface PushExtra {
  pushEnabled?: boolean;
  eas?: { projectId?: string };
}

const extra = (Constants.expoConfig?.extra ?? {}) as PushExtra;

/** The Expo project id when this build can get push notifications, undefined otherwise. */
const projectId: string | undefined = Platform.OS === "android" && extra.pushEnabled === true ? extra.eas?.projectId : undefined;

/** Whether this build can get push notifications at all. */
export const pushAvailable = projectId !== undefined;

// A push that arrives while the app is open still shows, as it would with the app closed.
if (pushAvailable) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** This phone's push token once known, for sign-out to hand back. */
let knownToken: string | undefined;

/** This phone's push token, if this session has learnt it. */
export function currentPushToken(): string | undefined {
  return knownToken;
}

/** Forgets the token here after sign-out. */
export function forgetCurrentPushToken(): void {
  knownToken = undefined;
}

/** Whether the phone lets LIBRAS show notifications: `blocked` when the Member said no and Android will not ask again. */
export type PushPermission = "granted" | "askable" | "blocked" | "unavailable";

export async function pushPermission(): Promise<PushPermission> {
  if (!pushAvailable) return "unavailable";
  try {
    const status = await Notifications.getPermissionsAsync();
    if (status.granted) return "granted";
    return status.canAskAgain ? "askable" : "blocked";
  } catch {
    return "unavailable";
  }
}

/**
 * This phone's Expo push token, asking the Member for permission first when
 * `ask` is true and Android may still ask. Undefined when this build cannot get
 * push notifications, permission is not given, or the token cannot be had now
 * (offline, say): the next start tries again. Never throws.
 */
export async function pushTokenOfThisPhone({ ask }: { ask: boolean }): Promise<string | undefined> {
  if (projectId === undefined) return undefined;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "LIBRAS",
      importance: Notifications.AndroidImportance.HIGH,
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return undefined;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    knownToken = data;
    return data;
  } catch {
    return undefined;
  }
}
