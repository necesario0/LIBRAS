// Prepares the Saved books flow through the end-to-end API: a verified UMAK Student
// with no Loans, Holds or Saved books, a Visitor, a Book with a Copy available and
// a Book with none. Outputs:
//   email, password                     the UMAK Student
//   visitorEmail, visitorPassword       the Visitor
//   firstWord, firstTitle               the Book with a Copy available (saved first)
//   secondWord, secondTitle             the Book with no Copy available (saved second)
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const headers = { "Content-Type": "application/json" };
const letters = "abcdefghijklmnopqrstuvwxyz";
function randomWord(prefix) {
  let word = prefix;
  for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
  return word;
}
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
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
const visitor = post("/e2e/members", { accountType: "visitor" });

const firstWord = randomWord("zs");
const secondWord = randomWord("zt");
const firstTitle = "The " + capitalize(firstWord) + " Keepsake";
const secondTitle = "The " + capitalize(secondWord) + " Backlog";
post("/e2e/books", { title: firstTitle, authors: ["Zxqy, Sara"], availableCopies: 2, onLoanCopies: 1 });
post("/e2e/books", { title: secondTitle, authors: ["Zxqy, Tomas"], availableCopies: 0, onLoanCopies: 1 });

output.email = student.email;
output.password = student.password;
output.visitorEmail = visitor.email;
output.visitorPassword = visitor.password;
output.firstWord = firstWord;
output.firstTitle = firstTitle;
output.secondWord = secondWord;
output.secondTitle = secondTitle;
