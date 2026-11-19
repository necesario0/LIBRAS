import { randomUUID } from "node:crypto";
import type { PushMessage, PushReceipt, PushSender, PushTicket } from "../push/sender.ts";

/**
 * A push sender that sends nothing and keeps every message for the test to read.
 * It can act as the push service refusing a token, at once or later in a
 * receipt, and as the service being down.
 */
export class CapturingPushSender implements PushSender {
  #sent: PushMessage[] = [];
  #attempted: PushMessage[] = [];
  #failing = false;
  #invalidNow = new Set<string>();
  #invalidLater = new Set<string>();
  /** The token of each ticket handed out. */
  #tickets = new Map<string, string>();
  #receiptCalls = 0;

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (this.#failing) throw new Error("The push sender was told to fail");
    return messages.map((message): PushTicket => {
      this.#attempted.push({ ...message, data: { ...message.data } });
      if (this.#invalidNow.has(message.to)) return { status: "invalid_token" };
      this.#sent.push({ ...message, data: { ...message.data } });
      const id = `ticket-${randomUUID()}`;
      this.#tickets.set(id, message.to);
      return { status: "ok", id };
    });
  }

  async receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    this.#receiptCalls += 1;
    if (this.#failing) throw new Error("The push sender was told to fail");
    const receipts = new Map<string, PushReceipt>();
    for (const id of ticketIds) {
      const token = this.#tickets.get(id);
      if (token !== undefined) receipts.set(id, this.#invalidLater.has(token) ? "invalid_token" : "ok");
    }
    return receipts;
  }

  /** While true, every call throws: the push service being down. */
  set failing(failing: boolean) {
    this.#failing = failing;
  }

  /** The service refuses this token at once, as no longer registered. */
  refuseNow(token: string): void {
    this.#invalidNow.add(token);
  }

  /** The service accepts messages to this token, and their receipts say it is no longer registered. */
  refuseInReceipts(token: string): void {
    this.#invalidLater.add(token);
  }

  /** How many times receipts were asked for. */
  get receiptCalls(): number {
    return this.#receiptCalls;
  }

  /** Every captured message, oldest first. */
  get sent(): readonly PushMessage[] {
    return [...this.#sent];
  }

  /** The messages sent to this token, oldest first. */
  sentTo(token: string): PushMessage[] {
    return this.#sent.filter((message) => message.to === token);
  }

  /** How many messages were handed to this sender for this token, those refused included. */
  attemptsTo(token: string): number {
    return this.#attempted.filter((message) => message.to === token).length;
  }

  clear(): void {
    this.#sent = [];
    this.#attempted = [];
  }
}
