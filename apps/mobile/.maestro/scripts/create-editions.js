// Adds the Books the sort and edition flow needs, through the end-to-end API
// (POST /e2e/books), all sharing a word no other Book has:
//   three editions of one work, "<Word> Calculus" by "Zorro, Ana": the 6th
//   (2008, on the shelf), the 7th (2012, on the shelf) and the 8th (2016, out);
//   "Aardvark <Word> Atlas" (2020, on the shelf) and "Mango <Word> Notes"
//   (1999, on the shelf).
// Outputs: word, work ("<Word> Calculus"), atlas, notes.
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const letters = "abcdefghijklmnopqrstuvwxyz";
let word = "zq";
for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
const Word = word.charAt(0).toUpperCase() + word.slice(1);

function addBook(book) {
  const response = http.post(base + "/e2e/books", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
  if (!response.ok) throw new Error("Adding the Book failed: " + response.status + " " + response.body);
}

const work = Word + " Calculus";
const atlas = "Aardvark " + Word + " Atlas";
const notes = "Mango " + Word + " Notes";
addBook({ title: work, authors: ["Zorro, Ana"], edition: "6th ed.", publicationYear: 2008, availableCopies: 1, onLoanCopies: 0 });
addBook({ title: work, authors: ["Zorro, Ana"], edition: "7th ed.", publicationYear: 2012, availableCopies: 1, onLoanCopies: 0 });
addBook({ title: work, authors: ["Zorro, Ana"], edition: "8th ed.", publicationYear: 2016, availableCopies: 0, onLoanCopies: 1 });
addBook({ title: atlas, authors: ["Yates, Bo"], publicationYear: 2020, availableCopies: 2, onLoanCopies: 0 });
addBook({ title: notes, authors: ["Xu, Cy"], publicationYear: 1999, availableCopies: 1, onLoanCopies: 0 });

output.word = word;
output.work = work;
output.atlas = atlas;
output.notes = notes;
