// Prepares the Announcement flows through the end-to-end API: a Visitor to sign in with, a Book, and the
// running Announcement chosen by the MODE variable:
//   web   a poster with text and a web link (https://forms.gle/e2e-sign-up), running today
//   book  a poster with no text and a Book link ("<Word> Almanac"), running today
//   none  no Announcement at all (every one is removed)
//   broken  a poster whose file is missing, so it fails to load on the Announcement screen, running today
// Outputs:
//   email, password        the Visitor
//   title                  the Announcement's title ("" for none)
//   bookId, bookTitle      the linked Book (book mode)
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

const visitor = post("/e2e/members", { accountType: "visitor" });
let word = "zq";
for (let i = 0; i < 9; i++) word += letters.charAt(Math.floor(Math.random() * 26));
const Word = word.charAt(0).toUpperCase() + word.slice(1);
const book = post("/e2e/books", { title: Word + " Almanac", authors: ["Zxqy, Ann"], availableCopies: 1, onLoanCopies: 0, publicationYear: 2021 });

let title = "";
if (MODE === "none") {
  post("/e2e/announcements/clear", {});
} else if (MODE === "web") {
  title = "Thesis Writing Clinic " + Word;
  post("/e2e/announcements", {
    title: title,
    body: "One-on-one help with your thesis. Bring your draft and a printed outline.",
    url: "https://forms.gle/e2e-sign-up",
  });
} else if (MODE === "book") {
  title = "Read this week " + Word;
  post("/e2e/announcements", { title: title, bookId: book.id });
} else if (MODE === "broken") {
  title = "Lost poster " + Word;
  post("/e2e/announcements", { title: title, body: "The poster of this one does not load.", posterMissing: true });
} else {
  throw new Error("MODE must be web, book, broken or none");
}

output.email = visitor.email;
output.password = visitor.password;
output.title = title;
output.bookId = book.id;
output.bookTitle = Word + " Almanac";
