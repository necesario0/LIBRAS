export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** The only way the API sends email. Tests swap in a sender that captures messages. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Local development sender: prints the message instead of sending it, so a
 * developer can read verification codes in the terminal.
 */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`[email] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}

/** Refuses to send. Used until a real email service is configured, so nothing is dropped silently. */
export class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<void> {
    throw new Error("No email service is configured");
  }
}
