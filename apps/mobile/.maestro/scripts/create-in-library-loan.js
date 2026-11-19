// Prepares the Visitor/Alumni in-library Loan flow: creates a verified Visitor
// and an available Book, and verifies that outside library hours checkout is
// refused with 409 library_closed.
// Outputs: email, password, bookId, bookWord, bookTitle.
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

const visitor = post("/e2e/members", { accountType: "visitor" });
const word = randomWord("zv");
const title = "The " + capitalize(word) + " Monograph";
const book = post("/e2e/books", { title: title, authors: ["Santos, Vera"], availableCopies: 1, onLoanCopies: 0 });

// Closed library hours (Friday 8:00 PM Manila) must refuse in-library checkout.
const closed = http.post(base + "/e2e/loans", {
  headers: headers,
  body: JSON.stringify({ email: visitor.email, bookId: book.id, at: "2026-11-20T20:00:00+08:00" }),
});
if (closed.status !== 409) {
  throw new Error("Expected 409 library_closed outside library hours, got " + closed.status + " " + closed.body);
}

output.email = visitor.email;
output.password = visitor.password;
output.bookId = book.id;
output.bookWord = word;
output.bookTitle = title;
