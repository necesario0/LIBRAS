// Reads the verification code the API "emailed" to EMAIL. The end-to-end API
// (apps/api/src/testing/e2e-server.ts) keeps every email it sends and serves
// them at /e2e/emails, which only exists on that server.
const response = http.get("http://127.0.0.1:3000/e2e/emails?to=" + encodeURIComponent(EMAIL));
const messages = json(response.body).messages;
if (!messages || messages.length === 0) throw new Error("No email was sent to " + EMAIL);
const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
if (!match) throw new Error("The email to " + EMAIL + " has no 6-digit code");
output.code = match[1];
