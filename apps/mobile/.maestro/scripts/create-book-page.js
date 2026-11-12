// Prepares the Book page flow through the end-to-end API: a Book with every
// detail and 2 of 3 Copies available, a Book with no Copy available, and a
// Visitor Member who can sign in. Outputs:
//   word, title, authors, edition, isbn, callNumber   the detailed Book
//   noneWord, noneTitle                               the Book with no Copy available
//   visitorEmail, visitorPassword                     the Visitor
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

const word = randomWord("zb");
const noneWord = randomWord("zn");
const title = "The " + capitalize(word) + " Reader";
const noneTitle = "Away " + capitalize(noneWord);
const isbn = "978" + String(Date.now()).slice(-9) + "7";
const callNumber = "QA76 .Z" + String(Date.now()).slice(-4) + " 2019";
post("/e2e/books", {
  title: title,
  authors: ["Zxqy, Ana M."],
  edition: "2nd edition",
  publicationYear: 1960,
  isbn: isbn,
  lcCallNumber: callNumber,
  availableCopies: 2,
  onLoanCopies: 1,
});
post("/e2e/books", { title: noneTitle, authors: ["Zxqy, Ben"], availableCopies: 0, onLoanCopies: 1 });
const visitor = post("/e2e/members", { accountType: "visitor" });

output.word = word;
output.title = title;
output.authors = "Zxqy, Ana M.";
output.edition = "2nd edition";
output.isbn = isbn;
output.callNumber = callNumber;
output.noneWord = noneWord;
output.noneTitle = noneTitle;
output.visitorEmail = visitor.email;
output.visitorPassword = visitor.password;
