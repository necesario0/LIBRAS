// Creates a Member through the API, the way the app does: sign-up, the emailed
// code (read from the end-to-end API's captured emails), verification. When
// VERIFY is "no" the sign-up is left unfinished, which gives an account that
// cannot sign in yet. Outputs email, password and firstName.
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const email = "e2e-" + unique + "@umak.edu.ph";
const password = "e2e-password-" + unique;
const headers = { "Content-Type": "application/json" };

const signUp = http.post(base + "/members/sign-up", {
  headers: headers,
  body: JSON.stringify({
    accountType: "umak_student",
    email: email,
    password: password,
    firstName: "Cobby",
    lastName: "Baldonado",
    username: "e2e_" + unique,
    details: { studentNumber: "K" + String(Date.now()).slice(-8), college: "CCIS" },
    acceptedTerms: true,
  }),
});
if (!signUp.ok) throw new Error("Sign-up failed: " + signUp.status + " " + signUp.body);

if (typeof VERIFY === "undefined" || VERIFY !== "no") {
  const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(email));
  const messages = json(mail.body).messages;
  const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
  if (!match) throw new Error("The email to " + email + " has no 6-digit code");
  const verify = http.post(base + "/members/sign-up/verify", {
    headers: headers,
    body: JSON.stringify({ email: email, code: match[1] }),
  });
  if (!verify.ok) throw new Error("Verification failed: " + verify.status + " " + verify.body);
}

output.email = email;
output.password = password;
output.firstName = "Cobby";
