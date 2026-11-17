// The Librarian records the return of the overdue Loan (overdue-loan.js made it
// three days late), so the return fixes a Fine of PHP 15 that nobody settles.
// Reads output.email and output.lateBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/returns", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.lateBookId }),
});
if (!response.ok) throw new Error("The return was not recorded: " + response.status + " " + response.body);
