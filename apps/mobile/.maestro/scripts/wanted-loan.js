// The Librarian lends the Member the only Copy of a Book that another Member
// will want (hold-on-wanted-loan.js): the end-to-end API runs the real
// confirmation with its clock set six days back, so with the seven-day loan
// period the Copy is due tomorrow, which puts a dot on My Books.
// Reads output.email and output.wantedBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.wantedBookId, daysAgo: 6 }),
});
if (!response.ok) throw new Error("The Loan was not confirmed: " + response.status + " " + response.body);
