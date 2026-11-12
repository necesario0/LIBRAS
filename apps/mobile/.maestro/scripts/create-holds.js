// Prepares the Holds flow through the end-to-end API: a verified UMAK Student, a
// Visitor, a Book with no Copy available (the Student places a Hold on it) and a
// Book with a Copy available (no Hold action). Outputs:
//   email, password                     the UMAK Student
//   visitorEmail, visitorPassword       the Visitor
//   heldWord, heldTitle                 the Book with no Copy available
//   openWord, openTitle                 the Book with a Copy available
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

const heldWord = randomWord("zh");
const openWord = randomWord("zo");
const heldTitle = "The " + capitalize(heldWord) + " Waitlist";
const openTitle = "The " + capitalize(openWord) + " Shelf";
post("/e2e/books", { title: heldTitle, authors: ["Zxqy, Hana"], availableCopies: 0, onLoanCopies: 2 });
post("/e2e/books", { title: openTitle, authors: ["Zxqy, Olga"], availableCopies: 1, onLoanCopies: 0 });

output.email = student.email;
output.password = student.password;
output.visitorEmail = visitor.email;
output.visitorPassword = visitor.password;
output.heldWord = heldWord;
output.heldTitle = heldTitle;
output.openWord = openWord;
output.openTitle = openTitle;
