// The Librarian records the return of the Delete my account flow's Loan, on
// time (no Fine): the Student is cleared. Reads output.email and
// output.loanBookId (create-delete-account.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/returns", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.loanBookId }),
});
if (!response.ok) throw new Error("The return was not recorded: " + response.status + " " + response.body);
