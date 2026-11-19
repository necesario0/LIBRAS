// After Delete my account in the app: the old email and password no longer sign
// in, and the "your account was deleted" email went to the old address.
// Reads output.email and output.password (create-delete-account.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";

const signIn = http.post(base + "/members/sign-in", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, password: output.password }),
});
if (signIn.status !== 401) throw new Error("The deleted account can still sign in: " + signIn.status + " " + signIn.body);

const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(output.email));
const messages = json(mail.body).messages;
const last = messages[messages.length - 1];
if (!last || last.subject !== "Your LIBRAS account was deleted") {
  throw new Error("No 'your account was deleted' email: " + (last ? last.subject : "no email"));
}
