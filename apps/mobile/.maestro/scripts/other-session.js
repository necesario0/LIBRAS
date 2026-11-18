// Signs EMAIL in through the API as another device would and outputs that
// session's accessToken, so a flow can check later what became of it.
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const response = http.post("http://127.0.0.1:3000/members/sign-in", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!response.ok) throw new Error("The other device could not sign in: " + response.status + " " + response.body);
output.accessToken = json(response.body).session.accessToken;
