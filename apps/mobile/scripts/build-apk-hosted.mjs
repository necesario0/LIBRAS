// Builds the release APK against the hosted API: `npm run build:apk:hosted -w @libras/mobile`.
//
// The API address is EXPO_PUBLIC_API_URL, from (first match wins) the first
// argument, the environment, or the repository's .env.hosted file (which
// `npm run setup:hosted` writes). It must be https. Only that one value is read
// from .env.hosted, so no secret reaches the build.
//
// Before the long Gradle build starts, the script asks the API for /health, so a
// wrong address or a sleeping Render service fails in a minute, not after 25.
//
// Push notifications (docs/push-notifications.md) are built in when
// apps/mobile/google-services.json exists and EXPO_PROJECT_ID is set, in the
// environment or in .env.hosted (it is an id, not a secret). Otherwise the APK
// works without them, and the script says so.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "..", "..", "..", ".env.hosted");

function fromEnvFile(name) {
  if (!existsSync(envFile)) return undefined;
  return parseEnv(readFileSync(envFile, "utf8"))[name];
}

const url = (process.argv[2] ?? process.env.EXPO_PUBLIC_API_URL ?? fromEnvFile("EXPO_PUBLIC_API_URL") ?? "").replace(/\/+$/, "");
if (!url.startsWith("https://")) {
  console.error(
    "The hosted API address must start with https://. Pass it as an argument, set EXPO_PUBLIC_API_URL,\n" +
      "or run `npm run setup:hosted` (it writes EXPO_PUBLIC_API_URL to .env.hosted).",
  );
  process.exit(2);
}

console.log(`Checking ${url}/health (a sleeping free Render service can take about a minute)...`);
try {
  const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body?.status !== "ok") throw new Error(`HTTP ${response.status}`);
  console.log("The hosted API is healthy. Building the APK.\n");
} catch (error) {
  console.error(`The hosted API did not answer its health check (${error instanceof Error ? error.message : error}). Not building.`);
  process.exit(1);
}

process.env.EXPO_PUBLIC_API_URL = url;

const projectId = process.env.EXPO_PROJECT_ID || fromEnvFile("EXPO_PROJECT_ID");
const googleServices = process.env.GOOGLE_SERVICES_JSON ?? join(here, "..", "google-services.json");
if (projectId && existsSync(googleServices)) {
  process.env.EXPO_PROJECT_ID = projectId;
  console.log("Push notifications: on (google-services.json and EXPO_PROJECT_ID found).\n");
} else {
  console.log(
    "Push notifications: OFF in this APK. To build them in, follow docs/push-notifications.md:\n" +
      "apps/mobile/google-services.json and EXPO_PROJECT_ID (environment or .env.hosted) are both needed.\n",
  );
}

await import(pathToFileURL(join(here, "build-apk.mjs")).href);
