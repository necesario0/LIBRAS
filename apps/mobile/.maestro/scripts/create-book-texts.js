// Prepares the summary and contents flow through the end-to-end API: a Book with a
// long summary and contents in the catalog's "--" style, a Book with a short
// summary only. Run it after create-members.js for a Member who can sign in. Outputs:
//   longWord, longTitle                   the Book with the long summary and the contents
//   shortWord, shortTitle, shortSummary   the Book with the short summary
//   chapterOne, chapterTwo, chapterThree  the chapters of the contents
//   summaryEnd                            the last words of the long summary
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

const longWord = randomWord("zs");
const shortWord = randomWord("zt");
const sentence = "This study follows the growth of the library from its first reading room to a modern collection.";
const summaryEnd = "and the people who kept it open.";
const longSummary = [sentence, sentence, sentence, sentence, sentence, "It ends with the readers " + summaryEnd].join(" ");
const shortSummary = "A short guide to reading maps.";
const chapters = ["Reading rooms", "The first catalog", "A modern collection"];

post("/e2e/books", {
  title: "The " + capitalize(longWord) + " Story",
  authors: ["Zxqy, Cleo"],
  availableCopies: 2,
  onLoanCopies: 0,
  summary: longSummary,
  contents: chapters[0] + " -- " + chapters[1] + " -- " + chapters[2],
});
post("/e2e/books", {
  title: "The " + capitalize(shortWord) + " Atlas",
  authors: ["Zxqy, Dino"],
  availableCopies: 1,
  onLoanCopies: 0,
  summary: shortSummary,
});

output.longWord = longWord;
output.longTitle = "The " + capitalize(longWord) + " Story";
output.shortWord = shortWord;
output.shortTitle = "The " + capitalize(shortWord) + " Atlas";
output.shortSummary = shortSummary;
output.chapterOne = chapters[0];
output.chapterTwo = chapters[1];
output.chapterThree = chapters[2];
output.summaryEnd = summaryEnd;
