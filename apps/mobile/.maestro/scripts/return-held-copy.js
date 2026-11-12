// The Librarian records the return of the ready-Hold flow's Copy at the desk: the
// end-to-end API runs the real return, which dispatches the Copy to the Hold the
// Member on the phone placed. Checks what the desk is told and the email the
// Member gets. Reads output.lenderEmail, output.heldBookId, output.email and
// output.heldTitle (create-hold-ready.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const response = http.post(base + "/e2e/returns", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.lenderEmail, bookId: output.heldBookId }),
});
if (!response.ok) throw new Error("The return was not recorded: " + response.status + " " + response.body);
const heldFor = json(response.body).loan.heldFor;
if (!heldFor || heldFor.memberName !== "Cobby Baldonado") {
  throw new Error("The returned Copy was not set aside for the Member on the phone: " + response.body);
}

const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(output.email));
const messages = json(mail.body).messages;
const ready = messages[messages.length - 1];
if (!ready || ready.subject !== "Your LIBRAS Hold is ready for pickup" || ready.text.indexOf(output.heldTitle) < 0) {
  throw new Error("The Member got no Hold-ready email for " + output.heldTitle + ": " + mail.body);
}
