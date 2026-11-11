import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseSsl } from "../src/db.ts";

const POOLER = "postgresql://postgres.abc:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

describe("databaseSsl", () => {
  it("does not use TLS for the local Supabase PostgreSQL", () => {
    assert.equal(databaseSsl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"), false);
    assert.equal(databaseSsl("postgresql://postgres:postgres@localhost:54322/postgres"), false);
  });

  it("requires TLS for any other host, encrypting even without a certificate to check against", () => {
    assert.deepEqual(databaseSsl(POOLER), { rejectUnauthorized: false });
  });

  it("verifies the server certificate when a CA certificate is supplied", () => {
    assert.deepEqual(databaseSsl(POOLER, "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----"), {
      ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("leaves the choice to the connection string when it names an sslmode", () => {
    assert.equal(databaseSsl(`${POOLER}?sslmode=verify-full`), undefined);
  });
});
