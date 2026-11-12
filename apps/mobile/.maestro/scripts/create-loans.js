// Prepares the Loans flow through the end-to-end API: a verified UMAK Student and
// two Books, each with Copies on the shelf. Outputs:
//   email, password                 the UMAK Student
//   borrowWord, borrowTitle         the Book the Student borrows in the flow
//   borrowBookId                    its id, for confirm-loan.js
//   lateBookId, lateTitle           the Book of the Loan that overdue-loan.js makes overdue
//   returnWord, returnTitle         a Book with one Copy, for the returns flow
//   returnBookId                    its id, for confirm-return-loan.js and return-loan.js
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

const borrowWord = randomWord("zb");
const borrowTitle = "The " + capitalize(borrowWord) + " Reader";
const lateTitle = "The " + capitalize(randomWord("zl")) + " Almanac";
const borrowBook = post("/e2e/books", { title: borrowTitle, authors: ["Zxqy, Bea"], availableCopies: 2, onLoanCopies: 0 });
const lateBook = post("/e2e/books", { title: lateTitle, authors: ["Zxqy, Lena"], availableCopies: 1, onLoanCopies: 0 });
const returnWord = randomWord("zr");
const returnTitle = "The " + capitalize(returnWord) + " Chronicle";
const returnBook = post("/e2e/books", { title: returnTitle, authors: ["Zxqy, Rae"], availableCopies: 1, onLoanCopies: 0 });

output.email = student.email;
output.password = student.password;
output.borrowWord = borrowWord;
output.borrowTitle = borrowTitle;
output.borrowBookId = borrowBook.id;
output.lateBookId = lateBook.id;
output.lateTitle = lateTitle;
output.returnWord = returnWord;
output.returnTitle = returnTitle;
output.returnBookId = returnBook.id;
