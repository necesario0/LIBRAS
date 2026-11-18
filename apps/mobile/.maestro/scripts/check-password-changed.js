// After a Change password in the app: the session of the other device (OTHER_TOKEN,
// from other-session.js) must be signed out, and the "Your LIBRAS password was
// changed" email must have gone to EMAIL, without either password in it.
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";

const other = http.get(base + "/members/me", { headers: { Authorization: "Bearer " + OTHER_TOKEN } });
if (other.status !== 401) throw new Error("The other device is still signed in: " + other.status);

const messages = json(http.get(base + "/e2e/emails?to=" + encodeURIComponent(EMAIL)).body).messages;
const notices = messages.filter(function (message) {
  return message.subject === "Your LIBRAS password was changed";
});
if (notices.length !== 1) throw new Error("Expected one 'password was changed' email, found " + notices.length);
const text = notices[0].text;
if (!/changed in the app/.test(text)) throw new Error("The email does not say the password was changed in the app: " + text);
if (text.indexOf(OLD_PASSWORD) !== -1 || text.indexOf(NEW_PASSWORD) !== -1) throw new Error("The email contains a password");
