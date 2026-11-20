// Prepares the notification inbox flow through the end-to-end API: a verified UMAK
// Student (the Member on the phone) with three unread Notifications, made the way
// the product makes them:
//   - a running Announcement (it replaces any other);
//   - a ready Hold: a second UMAK Student has the only Copy of a Book out, the
//     Member places a Hold on it, and the Librarian records the return (the real
//     Hold dispatch records the Notification);
//   - a Loan due tomorrow: the Member borrowed a Copy six days ago, and the Loan
//     notice job's Notification is recorded for it now (POST /e2e/notifications/loan:
//     the real notice only goes out from 08:00 library time).
// Outputs:
//   email, password                the UMAK Student on the phone
//   heldTitle                      the Book of the ready Hold
//   loanTitle                      the Book of the Loan due tomorrow
//   announcementTitle              the running Announcement
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
function post(path, body, accessToken) {
  const sent = accessToken ? { "Content-Type": "application/json", Authorization: "Bearer " + accessToken } : headers;
  const response = http.post(base + path, { headers: sent, body: JSON.stringify(body) });
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
const student = signUpStudent("n", "Cobby", "K" + stamp + "3");
const lender = signUpStudent("m", "Lena", "K" + stamp + "4");
const word = randomWord("zn");
const Word = capitalize(word);

// The Announcement, running today.
const announcementTitle = "Library Week " + Word;
post("/e2e/announcements", { title: announcementTitle, body: "Talks, games and a book swap all week." });

// The ready Hold.
const heldTitle = "The " + Word + " Pickup";
const held = post("/e2e/books", { title: heldTitle, authors: ["Zxqy, Pia"], availableCopies: 1, onLoanCopies: 0 });
post("/e2e/loans", { email: lender.email, bookId: held.id });
const session = post("/members/sign-in", { email: student.email, password: student.password }).session;
post("/holds", { bookId: held.id }, session.accessToken);
const returned = post("/e2e/returns", { email: lender.email, bookId: held.id });
if (!returned.loan.heldFor) throw new Error("The returned Copy was not set aside for the Member: " + JSON.stringify(returned));

// The Loan due tomorrow.
const loanTitle = Word + " Handbook";
const lent = post("/e2e/books", { title: loanTitle, authors: ["Zxqy, Lou"], availableCopies: 1, onLoanCopies: 0 });
post("/e2e/loans", { email: student.email, bookId: lent.id, daysAgo: 6 });
post("/e2e/notifications/loan", { email: student.email, bookId: lent.id, notice: "dueTomorrow" });

output.email = student.email;
output.password = student.password;
output.heldTitle = heldTitle;
output.loanTitle = loanTitle;
output.announcementTitle = announcementTitle;
