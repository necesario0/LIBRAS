// The Librarian lends the Member the only Copy of a Book that another Member
// will want (hold-on-wanted-loan.js): the end-to-end API runs the real
// confirmation. Reads output.email and output.wantedBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.wantedBookId }),
});
if (!response.ok) throw new Error("The Loan was not confirmed: " + response.status + " " + response.body);
