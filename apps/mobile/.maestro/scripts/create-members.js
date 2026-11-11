// Creates two Members through the API, the way the app does: sign-up, the emailed
// code (read from the end-to-end API's captured emails), verification. The first
// is verified and can sign in; the second is left unverified. Outputs
// email, password, firstName and unverifiedEmail, unverifiedPassword.
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const headers = { "Content-Type": "application/json" };

function signUp(label) {
  const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + label;
  const member = { email: "e2e-" + unique + "@umak.edu.ph", password: "e2e-password-" + unique };
  const response = http.post(base + "/members/sign-up", {
    headers: headers,
    body: JSON.stringify({
      accountType: "umak_student",
      email: member.email,
      password: member.password,
      firstName: "Cobby",
      lastName: "Baldonado",
      username: "e2e_" + unique,
      details: { studentNumber: "K" + String(Date.now()).slice(-7) + (label === "v" ? "1" : "2"), college: "CCIS" },
      acceptedTerms: true,
    }),
  });
  if (!response.ok) throw new Error("Sign-up failed: " + response.status + " " + response.body);
  return member;
}

const verified = signUp("v");
const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(verified.email));
const messages = json(mail.body).messages;
const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
if (!match) throw new Error("The email to " + verified.email + " has no 6-digit code");
const verify = http.post(base + "/members/sign-up/verify", {
  headers: headers,
  body: JSON.stringify({ email: verified.email, code: match[1] }),
});
if (!verify.ok) throw new Error("Verification failed: " + verify.status + " " + verify.body);

const unverified = signUp("u");

output.email = verified.email;
output.password = verified.password;
output.firstName = "Cobby";
output.unverifiedEmail = unverified.email;
output.unverifiedPassword = unverified.password;
