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

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoEmailSenderOptions {
  /** A Brevo API key (starts with `xkeysib-`). Sent only in the `api-key` header. */
  apiKey: string;
  /** The sender shown to the recipient. The address must be a verified sender in Brevo. */
  from: { address: string; name: string };
  /** The HTTP layer. Tests pass a fake. */
  fetch?: typeof fetch;
  /** Milliseconds before a send is abandoned. */
  timeoutMs?: number;
}

/** Brevo requires an HTML part: when a message has none, make one from the text. */
function htmlFromText(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<p>${escaped.replaceAll(/\r?\n/g, "<br>")}</p>`;
}

/**
 * Production sender: Brevo's transactional email API over HTTPS. Render's free
 * tier blocks SMTP ports, so an HTTP API is the only way out. Every failure
 * throws an Error whose message holds the status and Brevo's error code but
 * never the API key or the message body.
 */
export class BrevoEmailSender implements EmailSender {
  readonly #apiKey: string;
  readonly #from: { address: string; name: string };
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor({ apiKey, from, fetch: fetchImpl = fetch, timeoutMs = 15_000 }: BrevoEmailSenderOptions) {
    this.#apiKey = apiKey;
    this.#from = from;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.#fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: { "api-key": this.#apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: this.#from.name, email: this.#from.address },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html ?? htmlFromText(message.text),
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw new Error("The email service could not be reached", { cause: error });
    }
    if (response.ok) return;

    let code = "unknown";
    try {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string") {
        code = (body as { code: string }).code;
      }
    } catch {
      // The body was not JSON: the status alone is reported.
    }
    throw new Error(`The email service refused the message: HTTP ${response.status}, code ${code}`);
  }
}
