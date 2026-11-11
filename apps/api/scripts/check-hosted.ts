// Asks the hosted API for its health: `npm run check:hosted`.
//
// Render's free tier puts an idle service to sleep and takes about a minute to
// wake it, so this keeps asking for up to five minutes. The URL is
// EXPO_PUBLIC_API_URL in .env.hosted (the same address the app is built with),
// or the first argument.
const url = (process.argv[2] ?? process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
if (!url.startsWith("https://")) {
  console.error("Give the API address as https://..., as an argument or as EXPO_PUBLIC_API_URL in .env.hosted.");
  process.exit(2);
}

async function waitForHealth(): Promise<boolean> {
  const deadline = Date.now() + 5 * 60_000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(20_000) });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.ok && typeof body === "object" && body !== null && (body as { status?: unknown }).status === "ok") {
        console.log(`${url}/health answered: ${JSON.stringify(body)}`);
        return true;
      }
      console.log(`Attempt ${attempt}: HTTP ${response.status}`);
    } catch {
      console.log(`Attempt ${attempt}: no answer yet`);
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

if (!(await waitForHealth())) {
  console.error("The hosted API did not answer its health check. Look at the service's Logs tab in the Render dashboard.");
  // exitCode, not process.exit: exiting while a request is closing trips a libuv assertion on Windows.
  process.exitCode = 1;
}
