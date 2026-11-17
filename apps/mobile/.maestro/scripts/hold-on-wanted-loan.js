// Another UMAK Student places a Hold on the Book whose only Copy the Member has
// out (wanted-loan.js), through the real endpoints: sign-up, the emailed code,
// sign-in, then POST /holds. While that Hold waits, the Member's Loan cannot be
// renewed. Reads output.wantedBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
function post(path, body, accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = "Bearer " + accessToken;
  const response = http.post(base + path, { headers: headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(path + " failed: " + response.status + " " + response.body);
  return json(response.body);
}

const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + "w";
const waiter = { email: "e2e-" + unique + "@umak.edu.ph", password: "e2e-password-" + unique };
post("/members/sign-up", {
  accountType: "umak_student",
  email: waiter.email,
  password: waiter.password,
  firstName: "Wanda",
  lastName: "Baldonado",
  username: "e2e_" + unique,
  details: { studentNumber: "K" + String(Date.now()).slice(-7) + "9", college: "CCIS" },
  acceptedTerms: true,
});
const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(waiter.email));
const messages = json(mail.body).messages;
const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
if (!match) throw new Error("The email to " + waiter.email + " has no 6-digit code");
post("/members/sign-up/verify", { email: waiter.email, code: match[1] });
const signedIn = post("/members/sign-in", { email: waiter.email, password: waiter.password });
post("/holds", { bookId: output.wantedBookId }, signedIn.session.accessToken);
