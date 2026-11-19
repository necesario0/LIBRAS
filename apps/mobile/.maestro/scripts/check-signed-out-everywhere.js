// After "Sign out of all devices" in the app: the session of the other device
// (OTHER_TOKEN, from other-session.js) must be signed out.
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";

const other = http.get(base + "/members/me", { headers: { Authorization: "Bearer " + OTHER_TOKEN } });
if (other.status !== 401) throw new Error("The other device is still signed in: " + other.status);
