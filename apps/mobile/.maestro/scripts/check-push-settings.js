// Signs EMAIL in through the API and checks that the API stored the push
// notification switches the flow set in Settings: EXPECTED is a list such as
// "holdReady=false,loanDueTomorrow=true,loanOverdue=true,announcement=true".
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";

const signIn = http.post(base + "/members/sign-in", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!signIn.ok) throw new Error("Could not sign in to check the push settings: " + signIn.status + " " + signIn.body);
const token = json(signIn.body).session.accessToken;

const response = http.get(base + "/members/me/push-settings", { headers: { Authorization: "Bearer " + token } });
if (!response.ok) throw new Error("Could not read the push settings: " + response.status + " " + response.body);
const settings = json(response.body).settings;

const pairs = EXPECTED.split(",");
for (let i = 0; i < pairs.length; i++) {
  const parts = pairs[i].split("=");
  const want = parts[1] === "true";
  if (settings[parts[0]] !== want) {
    throw new Error("The API has " + parts[0] + "=" + settings[parts[0]] + ", expected " + want);
  }
}
