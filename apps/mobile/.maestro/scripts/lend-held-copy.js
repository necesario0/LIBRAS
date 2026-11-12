// The Librarian confirms a Loan of the Copy that is set aside for the Member on
// the phone: the end-to-end API reads the code on the Member's phone and runs
// the real confirmation with that Copy, which fulfils the Hold.
// Reads output.email and output.heldBookId (create-hold-ready.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.heldBookId }),
});
if (!response.ok) throw new Error("The Loan was not confirmed: " + response.status + " " + response.body);
