import { EmailOutcomeUnknownError } from "../email.ts";
import type { EmailMessage, EmailSender } from "../email.ts";

/** An email sender that sends nothing and keeps every message for the test to read. */
export class CapturingEmailSender implements EmailSender {
  #sent: EmailMessage[] = [];
  #failing = false;
  #answeringLate = false;

  #held: Promise<void> | undefined;

  async send(message: EmailMessage): Promise<void> {
    if (this.#held) await this.#held;
    if (this.#failing) throw new Error("The email sender was told to fail");
    this.#sent.push({ ...message });
    if (this.#answeringLate) throw new EmailOutcomeUnknownError();
  }

  /**
   * Makes every send wait, as a slow provider would, until the returned function is called.
   * A test uses it to fix the order of a race with a send in flight.
   */
  hold(): () => void {
    let release = () => {};
    this.#held = new Promise<void>((resolve) => {
      release = () => {
        this.#held = undefined;
        resolve();
      };
    });
    return release;
  }

  /** While true, every send is refused and nothing is captured: the provider being down. */
  set failing(failing: boolean) {
    this.#failing = failing;
  }

  /**
   * While true, every message is captured (the provider accepted it) and the send still rejects with
   * `EmailOutcomeUnknownError`: the provider answered after the sender stopped waiting.
   */
  set answeringLate(answeringLate: boolean) {
    this.#answeringLate = answeringLate;
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
