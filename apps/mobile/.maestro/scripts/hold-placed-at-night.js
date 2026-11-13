// Moves the time the Member's waiting Hold was placed to 04:00 on Nov 11 in the
// library's time zone (Manila), which is still Nov 10 in UTC and anywhere west of
// it. The Holds screen must show the library's day, whatever the phone's time zone.
// Reads output.email (create-holds.js).
//
// Needs the end-to-end API on port 3000 (npm run e2e starts it).
const base = "http://127.0.0.1:3000";
const response = http.post(base + "/e2e/holds/placed", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: output.email, placedAt: "2026-11-10T20:00:00.000Z" }),
});
if (!response.ok) throw new Error("The Hold could not be moved: " + response.status + " " + response.body);
if (json(response.body).moved !== 1) throw new Error("Expected one waiting Hold to move: " + response.body);
