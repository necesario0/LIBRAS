// The Pickup Window of the Member's ready Hold runs out: the end-to-end API moves
// the window two days back and runs the expiry sweep, which is what the API's
// timer and the database's schedule do on their own. Nobody opens the app or the
// desk page. Checks that exactly that Hold expired and that the Member got no
// second Hold-ready email. Reads output.email and output.heldBookId
// (create-hold-ready.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const response = http.post(base + "/e2e/holds/lapse", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, bookId: output.heldBookId }),
});
if (!response.ok) throw new Error("The Pickup Window did not run out: " + response.status + " " + response.body);
if (json(response.body).expired < 1) throw new Error("The sweep expired no Hold: " + response.body);

const mail = http.get(base + "/e2e/emails?to=" + encodeURIComponent(output.email));
const ready = json(mail.body).messages.filter(function (message) {
  return message.subject === "Your LIBRAS Hold is ready for pickup";
});
if (ready.length !== 1) throw new Error("The Member should have exactly one Hold-ready email (from the return), has " + ready.length);
