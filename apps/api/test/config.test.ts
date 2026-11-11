import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";

const local = { SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_test" };
const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.abc:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  BREVO_API_KEY: "xkeysib-test",
  EMAIL_FROM_ADDRESS: "library@example.com",
};

describe("loadConfig: allowed web origins", () => {
  it("allows none by default", () => {
    assert.deepEqual(loadConfig(local).corsAllowedOrigins, []);
  });

  it("reads a comma separated list of exact origins and tolerates spaces and a trailing slash", () => {
    const config = loadConfig({ ...local, CORS_ALLOWED_ORIGINS: "https://desk.example.com, http://127.0.0.1:5173/ ," });

    assert.deepEqual(config.corsAllowedOrigins, ["https://desk.example.com", "http://127.0.0.1:5173"]);
  });

  it("refuses a wildcard, because the API is called with bearer tokens from named pages only", () => {
    assert.throws(() => loadConfig({ ...local, CORS_ALLOWED_ORIGINS: "*" }), /CORS_ALLOWED_ORIGINS/);
  });

  it("refuses an entry that is not an origin", () => {
    assert.throws(() => loadConfig({ ...local, CORS_ALLOWED_ORIGINS: "desk.example.com" }), /CORS_ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ ...local, CORS_ALLOWED_ORIGINS: "https://desk.example.com/app" }), /CORS_ALLOWED_ORIGINS/);
  });
});

describe("loadConfig: email service", () => {
  it("needs no email service outside production", () => {
    assert.equal(loadConfig(local).email, undefined);
  });

  it("reads the Brevo key and the verified sender, with LIBRAS as the default sender name", () => {
    const config = loadConfig(production);

    assert.deepEqual(config.email, { apiKey: "xkeysib-test", fromAddress: "library@example.com", fromName: "LIBRAS" });
  });

  it("lets the sender name be set", () => {
    assert.equal(loadConfig({ ...production, EMAIL_FROM_NAME: "UMAK Library" }).email?.fromName, "UMAK Library");
  });

  it("refuses to start in production without the email service", () => {
    const { BREVO_API_KEY: _key, ...withoutKey } = production;
    const { EMAIL_FROM_ADDRESS: _from, ...withoutFrom } = production;

    assert.throws(() => loadConfig(withoutKey), /BREVO_API_KEY/);
    assert.throws(() => loadConfig(withoutFrom), /EMAIL_FROM_ADDRESS/);
  });

  it("refuses a key without a sender, and a sender without a key, outside production too", () => {
    assert.throws(() => loadConfig({ ...local, BREVO_API_KEY: "xkeysib-test" }), /EMAIL_FROM_ADDRESS/);
    assert.throws(() => loadConfig({ ...local, EMAIL_FROM_ADDRESS: "library@example.com" }), /BREVO_API_KEY/);
  });
});
