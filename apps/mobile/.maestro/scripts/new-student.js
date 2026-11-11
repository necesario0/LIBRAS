// Makes up a sign-up that has never been used, so the flow can run any number of
// times against the same database: a UMAK address, a username and a student number.
const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
output.email = "e2e-" + unique + "@umak.edu.ph";
output.username = "e2e_" + unique;
output.studentNumber = "K" + String(Date.now()).slice(-8);
output.password = "e2e-password-" + unique;
