// Adds the Books search mode's suggestions need, through the end-to-end API
// (POST /e2e/books): two Books by one author with words no other Book has.
// Outputs:
//   word, wordUpper   a title word, and the same word in capitals
//   prefix            its first six letters, as typed before the word is finished
//   title             the title of the first Book ("The <Word> Reader")
//   author, surname   the author of both Books ("<Surname>, Ana") and the surname
//   surnamePrefix     the first five letters of the surname
//   secondTitle       the title of the second Book
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
function addBook(title, authors) {
  const response = http.post(base + "/e2e/books", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, authors: authors, availableCopies: 1, onLoanCopies: 0 }),
  });
  if (!response.ok) throw new Error("Adding the Book failed: " + response.status + " " + response.body);
}

const word = randomWord("zq");
const other = randomWord("zr");
const surname = randomWord("zs");
const author = capitalize(surname) + ", Ana";
const title = "The " + capitalize(word) + " Reader";
const secondTitle = "Notes on " + capitalize(other);
addBook(title, [author]);
addBook(secondTitle, [author]);

output.word = word;
output.wordUpper = word.toUpperCase();
output.prefix = word.slice(0, 6);
output.title = title;
output.author = author;
output.surname = surname;
output.surnamePrefix = surname.slice(0, 5);
output.secondTitle = secondTitle;
