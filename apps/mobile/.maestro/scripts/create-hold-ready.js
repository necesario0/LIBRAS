// Prepares the ready-Hold flow through the end-to-end API: a verified UMAK
// Student (the Member on the phone), a second UMAK Student who has the only Copy
// of a Book out, and that Book. Outputs:
//   email, password              the UMAK Student on the phone
//   lenderEmail                  the Member who has the Copy out, for return-held-copy.js
//   heldWord, heldTitle          the Book
//   heldBookId                   its id, for return-held-copy.js and lend-held-copy.js
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
/** Signs a UMAK Student up and verifies the email with the code the end-to-end API captured. */
function signUpStudent(tag, firstName, studentNumber) {
  const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + tag;
  const student = { email: "e2e-" + unique + "@umak.edu.ph", password: "e2e-password-" + unique };
  post("/members/sign-up", {
    accountType: "umak_student",
    email: student.email,
    password: student.password,
    firstName: firstName,
    lastName: "Baldonado",
    username: "e2e_" + unique,
    details: { studentNumber: studentNumber, college: "CCIS" },
    acceptedTerms: true,
  });
  const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(student.email));
  const messages = json(mail.body).messages;
  const match = /\b(\d{6})\b/.exec(messages[messages.length - 1].text);
  if (!match) throw new Error("The email to " + student.email + " has no 6-digit code");
  post("/members/sign-up/verify", { email: student.email, code: match[1] });
  return student;
}

const stamp = String(Date.now()).slice(-7);
const student = signUpStudent("a", "Cobby", "K" + stamp + "1");
const lender = signUpStudent("b", "Lena", "K" + stamp + "2");

const heldWord = randomWord("zp");
const heldTitle = "The " + capitalize(heldWord) + " Pickup";
const book = post("/e2e/books", { title: heldTitle, authors: ["Zxqy, Pia"], availableCopies: 1, onLoanCopies: 0 });
// The Book's only Copy goes out to the other Member before the phone opens the app.
post("/e2e/loans", { email: lender.email, bookId: book.id });

output.email = student.email;
output.password = student.password;
output.lenderEmail = lender.email;
output.heldWord = heldWord;
output.heldTitle = heldTitle;
output.heldBookId = book.id;
