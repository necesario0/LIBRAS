// Adds the Books the Subject and Published filter flow needs, through the
// end-to-end API (POST /e2e/books), all sharing a word no other Book has:
//   "<Word> Algorithms" (QA76.9, Computer Science, 2019),
//   "<Word> Calculus" (QA303, Mathematics, 2010),
//   "<Word> Obligations" (KPM1, Law, 2022),
//   "<Word> Pamphlet" (no call number, so no Subject, 2021),
//   two editions of "<Word> Networks" by "Tanen, Andrew" (TK5105.5, Electrical
//   and Electronics Engineering): the 3rd (2003) and the 5th (2011).
// Searching the word gives 5 rows (the Networks editions fold into one).
// Outputs: word, algorithms, calculus, obligations, pamphlet, networks.
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
    body: JSON.stringify(Object.assign({ availableCopies: 1, onLoanCopies: 0 }, book)),
  });
  if (!response.ok) throw new Error("Adding the Book failed: " + response.status + " " + response.body);
}

const algorithms = Word + " Algorithms";
const calculus = Word + " Calculus";
const obligations = Word + " Obligations";
const pamphlet = Word + " Pamphlet";
const networks = Word + " Networks";
addBook({ title: algorithms, authors: ["Cormen, Thomas"], publicationYear: 2019, lcCallNumber: "QA76.9.A43 C67 2019" });
addBook({ title: calculus, authors: ["Leithold, Louis"], publicationYear: 2010, lcCallNumber: "QA303 .L42 2010" });
addBook({ title: obligations, authors: ["Paras, Edgardo"], publicationYear: 2022, lcCallNumber: "KPM1 .P37 2022" });
addBook({ title: pamphlet, authors: ["Uno, Ana"], publicationYear: 2021 });
addBook({ title: networks, authors: ["Tanen, Andrew"], edition: "3rd ed.", publicationYear: 2003, lcCallNumber: "TK5105.5 .T36 2003" });
addBook({ title: networks, authors: ["Tanen, Andrew"], edition: "5th ed.", publicationYear: 2011, lcCallNumber: "TK5105.5 .T36 2011" });

output.word = word;
output.algorithms = algorithms;
output.calculus = calculus;
output.obligations = obligations;
output.pamphlet = pamphlet;
output.networks = networks;
