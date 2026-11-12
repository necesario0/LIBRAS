// Adds Books to the catalog through the end-to-end API (POST /e2e/books) with
// words no other Book has, so a search finds exactly these. Outputs:
//   word       a title word, spelled correctly
//   typo       the same word with one letter missing
//   title      the title of the Book with 2 of 3 Copies available
//   loanTitle  the title of the Book whose only Copy is on loan
//   nothing    a query that matches no Book
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const letters = "abcdefghijklmnopqrstuvwxyz";
function randomWord(prefix) {
  let word = prefix;
  for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
  return word;
}
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
function addBook(title, authors, availableCopies, onLoanCopies) {
  const response = http.post(base + "/e2e/books", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, authors: authors, availableCopies: availableCopies, onLoanCopies: onLoanCopies }),
  });
  if (!response.ok) throw new Error("Adding the Book failed: " + response.status + " " + response.body);
}

const word = randomWord("zq");
const other = randomWord("zr");
const title = "The " + capitalize(word) + " Reader";
const loanTitle = "Borrowed " + capitalize(other);
addBook(title, ["Zxqy, Ana M."], 2, 1);
addBook(loanTitle, ["Zxqy, Ben"], 0, 1);

output.word = word;
output.typo = word.slice(0, 4) + word.slice(5);
output.title = title;
output.loanTitle = loanTitle;
output.other = other;
output.nothing = randomWord("zv") + " " + randomWord("zw");
