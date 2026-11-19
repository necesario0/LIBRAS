// Prepares the Home shelves flows through the end-to-end API: a verified UMAK
// Student (CCIS) who has borrowed one Law Book, a Visitor, and these Books, all
// sharing a word no other Book has. They are added oldest first, so the newest
// is the first on New arrivals:
//   "<Word> Ledger" (Law, its only Copy is out, so never "available now"),
//   "<Word> Primer" (no call number, so no Subject, 1 Copy),
//   "<Word> Statutes" (Law, 2 Copies; the Student borrows one: 1 Loan, 1 Copy left),
//   "<Word> Handbook", 1st ed. (2010) and 2nd ed. (2020): two editions of one work.
// Outputs:
//   email, password                       the UMAK Student (CCIS)
//   visitorEmail, visitorPassword         the Visitor
//   statutesTitle, statutesId             the Law Book the Student borrowed
//   primerTitle, primerId                 the Book with no Subject
//   ledgerId                              the Law Book with no Copy on the shelf
//   handbookNewId, handbookOldId          the 2nd and the 1st edition
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

const visitor = post("/e2e/members", { accountType: "visitor" });

let word = "zs";
for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
const Word = word.charAt(0).toUpperCase() + word.slice(1);

const ledger = post("/e2e/books", { title: Word + " Ledger", authors: ["Zxqy, Lou"], availableCopies: 0, onLoanCopies: 1, publicationYear: 2018, lcCallNumber: "KF801 .Z87 2018" });
const primer = post("/e2e/books", { title: Word + " Primer", authors: ["Zxqy, Pia"], availableCopies: 1, onLoanCopies: 0, publicationYear: 2019 });
const statutes = post("/e2e/books", { title: Word + " Statutes", authors: ["Zxqy, Sol"], availableCopies: 2, onLoanCopies: 0, publicationYear: 2020, lcCallNumber: "KF801 .Z88 2020" });
const handbookOld = post("/e2e/books", { title: Word + " Handbook", authors: ["Zxqy, Hal"], edition: "1st ed.", availableCopies: 1, onLoanCopies: 0, publicationYear: 2010 });
const handbookNew = post("/e2e/books", { title: Word + " Handbook", authors: ["Zxqy, Hal"], edition: "2nd ed.", availableCopies: 1, onLoanCopies: 0, publicationYear: 2020 });

// The Student borrows one Copy of the Law Book: their top Subject is Law, and the book counts as borrowed in CCIS.
post("/e2e/loans", { email: student.email, bookId: statutes.id });

output.email = student.email;
output.password = student.password;
output.visitorEmail = visitor.email;
output.visitorPassword = visitor.password;
output.statutesTitle = Word + " Statutes";
output.statutesId = statutes.id;
output.primerTitle = Word + " Primer";
output.primerId = primer.id;
output.ledgerId = ledger.id;
output.handbookNewId = handbookNew.id;
output.handbookOldId = handbookOld.id;
