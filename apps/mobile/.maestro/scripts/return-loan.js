// The Librarian records a return at the desk: the end-to-end API runs the real
// return of the Copy the Member has out of the returns flow's Book.
// Reads output.email and output.returnBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/returns", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.returnBookId }),
});
if (!response.ok) throw new Error("The return was not recorded: " + response.status + " " + response.body);
