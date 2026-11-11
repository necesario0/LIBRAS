import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeTarget, parseHostedDatabaseUrl } from "../scripts/hosted-database.ts";

const POOLER = "postgresql://postgres.abcdefgh:s3cret%40pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

describe("parseHostedDatabaseUrl", () => {
  it("splits the password from the connection string so it never has to appear on a command line", () => {
    const target = parseHostedDatabaseUrl(POOLER);

    assert.equal(target.urlWithoutPassword, "postgresql://postgres.abcdefgh@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres");
    assert.equal(target.password, "s3cret@pw");
    assert.ok(!target.urlWithoutPassword.includes("s3cret"));
  });

  it("describes the target without the password, for showing to the developer", () => {
    const description = describeTarget(parseHostedDatabaseUrl(POOLER));

    assert.equal(description, "postgres.abcdefgh@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres");
    assert.ok(!description.includes("s3cret"));
  });

  it("refuses when DATABASE_URL is missing, and says how to set it", () => {
    assert.throws(() => parseHostedDatabaseUrl(undefined), /DATABASE_URL.*setup:hosted/s);
  });

  it("refuses the local database, so the hosted command can never touch it by mistake", () => {
    assert.throws(() => parseHostedDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"), /local/i);
    assert.throws(() => parseHostedDatabaseUrl("postgresql://postgres:postgres@localhost:54322/postgres"), /local/i);
  });

  it("refuses something that is not a PostgreSQL connection string, without echoing it", () => {
    assert.throws(
      () => parseHostedDatabaseUrl("https://user:topsecret@example.com/db"),
      (error: Error) => /postgres/i.test(error.message) && !error.message.includes("topsecret"),
    );
    assert.throws(
      () => parseHostedDatabaseUrl("not a url with topsecret"),
      (error: Error) => !error.message.includes("topsecret"),
    );
  });

  it("refuses a connection string with no password", () => {
    assert.throws(() => parseHostedDatabaseUrl("postgresql://postgres.abc@db.example.com:5432/postgres"), /password/i);
  });

  it("refuses the unfilled placeholder Supabase shows in its connection string", () => {
    assert.throws(
      () => parseHostedDatabaseUrl("postgresql://postgres.abc:[YOUR-PASSWORD]@db.example.com:5432/postgres"),
      /YOUR-PASSWORD/,
    );
  });
});
