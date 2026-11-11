import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrevoEmailSender } from "../src/email.ts";

const API_KEY = "xkeysib-test-key-0000";

interface RecordedRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake HTTP layer: records the request and answers with the given response. */
function fakeFetch(respond: () => Response | Promise<Response>): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fakeFetchImpl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    requests.push({
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return respond();
  };
  return { fetch: fakeFetchImpl as typeof fetch, requests };
}

function sender(fetchImpl: typeof fetch): BrevoEmailSender {
  return new BrevoEmailSender({
    apiKey: API_KEY,
    from: { address: "library@example.com", name: "LIBRAS" },
    fetch: fetchImpl,
  });
}

const created = () =>
  new Response(JSON.stringify({ messageId: "<1@relay.example.com>" }), { status: 201, headers: { "content-type": "application/json" } });

describe("BrevoEmailSender", () => {
  it("posts the message to the Brevo transactional email API with the API key", async () => {
    const { fetch, requests } = fakeFetch(created);

    await sender(fetch).send({
      to: "ana.reyes@umak.edu.ph",
      subject: "Your LIBRAS verification code",
      text: "Your code is 123456.",
      html: "<p>Your code is <b>123456</b>.</p>",
    });

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request?.url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(request?.method, "POST");
    assert.equal(request?.headers["api-key"], API_KEY);
    assert.equal(request?.headers["content-type"], "application/json");
    assert.deepEqual(request?.body, {
      sender: { name: "LIBRAS", email: "library@example.com" },
      to: [{ email: "ana.reyes@umak.edu.ph" }],
      subject: "Your LIBRAS verification code",
      textContent: "Your code is 123456.",
      htmlContent: "<p>Your code is <b>123456</b>.</p>",
    });
  });

  it("builds the HTML part from the text when the message has none, escaping markup", async () => {
    const { fetch, requests } = fakeFetch(created);

    await sender(fetch).send({ to: "a@example.com", subject: "Hi", text: "Line one <b>\nLine two & more" });

    const body = requests[0]?.body as { htmlContent: string };
    assert.equal(body.htmlContent, "<p>Line one &lt;b&gt;<br>Line two &amp; more</p>");
  });

  it("fails with the status and Brevo's code when the service refuses, without leaking the API key", async () => {
    const { fetch } = fakeFetch(
      () => new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 }),
    );

    await assert.rejects(
      () => sender(fetch).send({ to: "a@example.com", subject: "Hi", text: "Hello" }),
      (error: Error) => {
        assert.match(error.message, /401/);
        assert.match(error.message, /unauthorized/);
        assert.ok(!error.message.includes(API_KEY));
        return true;
      },
    );
  });

  it("fails when the service cannot be reached, without leaking the API key", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(
      () => sender(fetch).send({ to: "a@example.com", subject: "Hi", text: "Hello" }),
      (error: Error) => {
        assert.match(error.message, /could not be reached/i);
        assert.ok(!error.message.includes(API_KEY));
        assert.ok(error.cause instanceof TypeError);
        return true;
      },
    );
  });

  it("fails when the service answers with something that is not JSON", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));

    await assert.rejects(() => sender(fetch).send({ to: "a@example.com", subject: "Hi", text: "Hello" }), /502/);
  });
});
