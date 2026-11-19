// Prepares the Delete my account flow through the end-to-end API: a verified
// UMAK Student with one Loan out (the Librarian confirms it at the desk), so the
// Student is not cleared yet. Outputs:
//   email, password       the UMAK Student
//   loanBookId, loanTitle the Book of the Loan; return-delete-account-loan.js returns it
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const headers = { "Content-Type": "application/json" };
const letters = "abcdefghijklmnopqrstuvwxyz";
function post(path, body) {
  const response = http.post(base + path, { headers: headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(path + " failed: " + response.status + " " + response.body);
  return json(response.body);
}

const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const student = { email: "e2e-" + unique + "@umak.edu.ph", password: "e2e-password-" + unique };
post("/members/sign-up", {
  accountType: "umak_student",
  email: student.email,
  password: student.password,
  firstName: "Cobby",
  lastName: "Baldonado",
  username: "e2e_" + unique,
  details: { studentNumber: "K" + String(Date.now()).slice(-8), college: "CCIS" },
  acceptedTerms: true,
});
const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(student.email));
const messages = json(mail.body).messages;
const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
if (!match) throw new Error("The email to " + student.email + " has no 6-digit code");
post("/members/sign-up/verify", { email: student.email, code: match[1] });

let word = "zd";
for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
const loanTitle = "The " + word.charAt(0).toUpperCase() + word.slice(1) + " Ledger";
const book = post("/e2e/books", { title: loanTitle, authors: ["Zxqy, Dee"], availableCopies: 1, onLoanCopies: 0 });
post("/e2e/loans", { email: student.email, bookId: book.id });

output.email = student.email;
output.password = student.password;
output.loanBookId = book.id;
output.loanTitle = loanTitle;
