// Sends one real email through the configured email service:
//
//   npm run email:test -- someone@example.com
//
// Reads BREVO_API_KEY and EMAIL_FROM_ADDRESS from .env.hosted. Use it once to
// prove the email service works. It prints whether the service accepted the
// message, never a key.
import { loadConfig } from "../src/config.ts";
import { BrevoEmailSender } from "../src/email.ts";

const recipient = process.argv[2];
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error("Usage: npm run email:test -- someone@example.com");
  process.exit(2);
}

const { email } = loadConfig();
if (!email) {
  console.error("BREVO_API_KEY and EMAIL_FROM_ADDRESS are not set. Run `npm run setup:hosted` first: it writes them to .env.hosted.");
  process.exit(1);
}

const sender = new BrevoEmailSender({ apiKey: email.apiKey, from: { address: email.fromAddress, name: email.fromName } });
try {
  await sender.send({
    to: recipient,
    subject: "LIBRAS email test",
    text: "This is a test message from the LIBRAS API. If you can read it, the email service works.",
  });
  console.log(`Brevo accepted the message for ${recipient}, sent from ${email.fromAddress}. Check the inbox (and the spam folder).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "The message was not sent");
  // exitCode, not process.exit: exiting while a request is closing trips a libuv assertion on Windows.
  process.exitCode = 1;
}
