// The Librarian confirms a Loan of the returns flow's Book: the end-to-end API
// reads the code on the Member's phone and runs the real confirmation with the
// Book's only Copy. Reads output.email and output.returnBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.returnBookId }),
});
if (!response.ok) throw new Error("The Loan was not confirmed: " + response.status + " " + response.body);
