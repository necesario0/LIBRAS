// Confirms a Visitor in-library Loan during Friday open library hours (10:00 AM
// Manila, due at 7:00 PM closing that same day).
// Reads output.email and output.bookId (create-in-library-loan.js).
const response = http.post("http://127.0.0.1:3000/e2e/loans", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.bookId, at: "2026-11-20T10:00:00+08:00" }),
});
if (!response.ok) throw new Error("The in-library Loan was not confirmed: " + response.status + " " + response.body);
