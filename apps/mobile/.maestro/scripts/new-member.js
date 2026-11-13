// Makes up a sign-up that has never been used, so a flow can run any number of
// times against the same database: an email on the domain the flow passes in as
// EMAIL_DOMAIN, a username, a password and an ID number of digits.
const unique = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
output.email = "e2e-" + unique + "@" + EMAIL_DOMAIN;
output.username = "e2e_" + unique;
output.idNumber = String(Date.now()).slice(-9);
output.password = "e2e-password-" + unique;
