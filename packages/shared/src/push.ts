import { z } from "zod";

/**
 * Push notifications (GLOSSARY: Push notification). A Member's phone gets one
 * for four kinds of event, each with its own switch the API stores:
 *
 * - `holdReady`: a Hold of theirs became ready (Hold dispatch);
 * - `loanDueTomorrow`: a Loan is due tomorrow (with the Loan notice email);
 * - `loanOverdue`: a Loan is now overdue, once, on its first overdue day (with the Loan notice email);
 * - `announcement`: a new Announcement has started.
 *
 * Loan notice emails are sent whatever the switches say.
 */
export const PUSH_KINDS = ["holdReady", "loanDueTomorrow", "loanOverdue", "announcement"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** Which kinds the Member gets: the first three start on, Announcements off. */
export type PushSettings = Record<PushKind, boolean>;

/** The body of `GET` and `PATCH /members/me/push-settings`. */
export interface PushSettingsResponse {
  settings: PushSettings;
}

/** The body of `PATCH /members/me/push-settings`: the switches to change, at least one. */
export const pushSettingsChangeSchema = z
  .strictObject({
    holdReady: z.boolean().optional(),
    loanDueTomorrow: z.boolean().optional(),
    loanOverdue: z.boolean().optional(),
    announcement: z.boolean().optional(),
  })
  .refine((change) => Object.keys(change).length > 0, { message: "Name at least one switch." });
export type PushSettingsChange = z.infer<typeof pushSettingsChangeSchema>;

/**
 * An Expo push token, as `expo-notifications` gives it: `ExponentPushToken[...]`
 * (or the newer `ExpoPushToken[...]`). Expo's push service delivers through
 * Firebase Cloud Messaging on Android.
 */
export const pushTokenSchema = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,256}\]$/);

/** The body of `PUT /members/me/push-device`: this phone's push token. */
export const pushDeviceRequestSchema = z.strictObject({ token: pushTokenSchema });
export type PushDeviceRequest = z.infer<typeof pushDeviceRequestSchema>;

/**
 * The body of `POST /auth/sign-out`, which may be empty. With `pushToken` the
 * phone also stops getting push notifications.
 */
export const signOutRequestSchema = z.strictObject({ pushToken: pushTokenSchema.optional() });
export type SignOutRequest = z.infer<typeof signOutRequestSchema>;

/** What a push notification carries for the app: its kind, so a tap opens the screen it is about. */
export interface PushData {
  kind: PushKind;
}

/** The screen a tapped push notification opens: My Books on a segment, or the running Announcement. */
export type PushDestination = { screen: "myBooks"; segment: "holds" | "loans" } | { screen: "announcement" };

/** Where a tap on a push notification with this data leads, or undefined for data the app does not know. */
export function pushDestination(data: unknown): PushDestination | undefined {
  const kind = typeof data === "object" && data !== null ? (data as { kind?: unknown }).kind : undefined;
  switch (kind) {
    case "holdReady":
      return { screen: "myBooks", segment: "holds" };
    case "loanDueTomorrow":
    case "loanOverdue":
      return { screen: "myBooks", segment: "loans" };
    case "announcement":
      return { screen: "announcement" };
    default:
      return undefined;
  }
}

/** The words of the Push notifications section of Settings. */
export const PUSH_MESSAGES = {
  emailsAlwaysSent: "Loan notice emails are always sent, whatever you choose here.",
  saveFailed: "We could not save that. Check your connection and try again.",
  loadFailed: "We could not load your notification settings.",
  blocked: "Your phone blocks notifications from LIBRAS. Allow them in your phone's settings to get these.",
} as const;
