import type { PushData } from "@libras/shared";

/** One push notification to one phone. */
export interface PushMessage {
  /** The phone's Expo push token. */
  to: string;
  title: string;
  body: string;
  /** What the app reads when the push notification is tapped. */
  data: PushData;
}

/**
 * What the push service said about one message, right away:
 * - `ok`: accepted, with the ticket whose receipt tells later whether it was delivered;
 * - `invalid_token`: the token belongs to no phone any more (the app was removed, say): forget it;
 * - `error`: refused for another reason.
 */
export type PushTicket = { status: "ok"; id: string } | { status: "invalid_token" } | { status: "error"; message: string };

/** What a receipt says, some minutes after the send: delivered, a token that is no longer valid, or another error. */
export type PushReceipt = "ok" | "invalid_token" | "error";

/**
 * The only way the API sends push notifications. Tests swap in a sender that
 * captures messages (`CapturingPushSender`).
 */
export interface PushSender {
  /** Sends the messages, at most 100 at once. Answers one ticket per message, in their order. Throws when the service could not be asked. */
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
  /** The receipts of these tickets, at most 1000 at once. A ticket missing from the answer has no receipt yet. Throws when the service could not be asked. */
  receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>>;
}

/** How many messages one call to Expo's push service may carry. */
export const PUSH_BATCH_SIZE = 100;
/** How many receipts one call may ask for. */
export const RECEIPT_BATCH_SIZE = 1000;

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** The Android notification channel the app creates (`src/push` in the app). */
export const ANDROID_CHANNEL_ID = "default";

export interface ExpoPushSenderOptions {
  /** An Expo access token, needed only when the Expo project turns on "enhanced security for push notifications". */
  accessToken?: string;
  /** The HTTP layer. Tests pass a fake. */
  fetch?: typeof fetch;
  /** Milliseconds before a call is abandoned. */
  timeoutMs?: number;
}

interface ExpoTicket {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: { error?: unknown };
}

const isInvalidToken = (entry: ExpoTicket) => entry.details?.error === "DeviceNotRegistered";

/**
 * Production sender: Expo's push service over HTTPS. Expo passes each message
 * to Firebase Cloud Messaging for an Android phone; the Firebase credentials
 * live in the Expo project, not here. Errors never carry the access token.
 */
export class ExpoPushSender implements PushSender {
  readonly #accessToken: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({ accessToken, fetch: fetchImpl = fetch, timeoutMs = 15_000 }: ExpoPushSenderOptions = {}) {
    this.#accessToken = accessToken;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async #post(url: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(this.#accessToken ? { authorization: `Bearer ${this.#accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw new Error("The push service could not be reached", { cause: error });
    }
    if (!response.ok) throw new Error(`The push service refused the request: HTTP ${response.status}`);
    const answer = (await response.json()) as { data?: unknown };
    return answer.data;
  }

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];
    if (messages.length > PUSH_BATCH_SIZE) throw new Error(`At most ${PUSH_BATCH_SIZE} push messages go in one call`);
    const data = await this.#post(
      EXPO_SEND_URL,
      messages.map((message) => ({
        to: message.to,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: "default",
        priority: "high",
        channelId: ANDROID_CHANNEL_ID,
      })),
    );
    if (!Array.isArray(data) || data.length !== messages.length) throw new Error("The push service answered without a ticket for each message");
    return (data as ExpoTicket[]).map((entry): PushTicket => {
      if (entry.status === "ok" && typeof entry.id === "string") return { status: "ok", id: entry.id };
      if (isInvalidToken(entry)) return { status: "invalid_token" };
      const reason = typeof entry.details?.error === "string" ? entry.details.error : typeof entry.message === "string" ? entry.message : "unknown";
      return { status: "error", message: reason };
    });
  }

  async receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    const receipts = new Map<string, PushReceipt>();
    if (ticketIds.length === 0) return receipts;
    if (ticketIds.length > RECEIPT_BATCH_SIZE) throw new Error(`At most ${RECEIPT_BATCH_SIZE} receipts are asked for in one call`);
    const data = await this.#post(EXPO_RECEIPTS_URL, { ids: ticketIds });
    if (typeof data !== "object" || data === null) throw new Error("The push service answered receipts without data");
    for (const [id, entry] of Object.entries(data as Record<string, ExpoTicket>)) {
      receipts.set(id, entry.status === "ok" ? "ok" : isInvalidToken(entry) ? "invalid_token" : "error");
    }
    return receipts;
  }
}
