// Gives the Member a Loan that is overdue today: the end-to-end API runs the real
// confirmation with its clock set ten days back, so the Copy was due three days ago.
// Reads output.email and output.lateBookId (create-loans.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.lateBookId, daysAgo: 10 }),
});
if (!response.ok) throw new Error("The overdue Loan was not made: " + response.status + " " + response.body);
