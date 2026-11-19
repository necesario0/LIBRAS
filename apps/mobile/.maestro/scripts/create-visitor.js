// Makes a Visitor Member who can sign in, through the end-to-end API (no sign-up
// screens, no verification email). Outputs visitorEmail and visitorPassword.
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/e2e/members", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ accountType: "visitor" }),
});
if (!response.ok) throw new Error("The Visitor was not made: " + response.status + " " + response.body);
const visitor = json(response.body);
output.visitorEmail = visitor.email;
output.visitorPassword = visitor.password;
