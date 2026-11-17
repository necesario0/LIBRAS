import type { EmailMessage, EmailSender } from "../email.ts";

/** An email sender that sends nothing and keeps every message for the test to read. */
export class CapturingEmailSender implements EmailSender {
  #sent: EmailMessage[] = [];
  #failing = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.#failing) throw new Error("The email sender was told to fail");
    this.#sent.push({ ...message });
  }

  /** While true, every send is refused and nothing is captured: the provider being down. */
  set failing(failing: boolean) {
    this.#failing = failing;
  }

  /** Every captured message, oldest first. */
  get sent(): readonly EmailMessage[] {
    return [...this.#sent];
  }

  /** The newest message sent to this address, if any. */
  lastTo(address: string): EmailMessage | undefined {
    return this.#sent.findLast((message) => message.to === address);
  }

  clear(): void {
    this.#sent = [];
  }
}
