// Emulator end-to-end test: makes sure the API is up and an Android device is
// running, installs build/libras.apk and runs every Maestro flow in .maestro/.
// Needs the local database running (npm run db:start) and `npm run build:apk`
// done. Hold the shared database lock while this runs (see the README).
//
// Device: ANDROID_SERIAL if set, otherwise the first connected device, otherwise
// the AVD named by LIBRAS_AVD (default Medium_Phone) is started and stopped again.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { androidEnv } from "./env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const { env, isWindows } = androidEnv();
const avd = process.env.LIBRAS_AVD ?? "Medium_Phone";
const apk = join(root, "build", "libras.apk");
const healthUrl = `http://127.0.0.1:${process.env.PORT ?? 3000}/health`;

const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sh = (command, args, options = {}) =>
  spawnSync(command, args, { env, encoding: "utf8", shell: isWindows, ...options });

let serial = process.env.ANDROID_SERIAL ?? null;
const adb = (...args) => sh("adb", ["-s", serial, ...args]);

/** The serial of the first device that is online, or null. */
function findDevice() {
  const lines = (sh("adb", ["devices"]).stdout ?? "").split(NEWLINE).slice(1);
  for (const line of lines) {
    const [name, state] = line.trim().split(TAB);
    if (name && state === "device") return name;
  }
  return null;
}

async function waitFor(label, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function apiIsUp() {
  try {
    return (await fetch(healthUrl)).ok;
  } catch {
    return false;
  }
}

const children = [];
let startedEmulator = false;
function cleanup() {
  for (const child of children) {
    if (isWindows) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)]);
    else child.kill();
  }
  if (startedEmulator && serial) adb("emu", "kill");
}

async function main() {
  if (!existsSync(apk)) throw new Error(`${apk} not found. Run npm run build:apk -w @libras/mobile first.`);

  if (!(await apiIsUp())) {
    console.log("Starting the API ...");
    // with-local-supabase.ts reads the local Supabase keys, then runs the server.
    children.push(
      spawn(process.execPath, ["scripts/with-local-supabase.ts", process.execPath, "src/server.ts"], {
        cwd: join(repoRoot, "apps", "api"),
        env,
        stdio: "inherit",
      }),
    );
    await waitFor("the API (is the database running? npm run db:start)", apiIsUp, 60_000);
  }

  serial ??= findDevice();
  if (!serial) {
    console.log(`Starting the emulator ${avd} ...`);
    startedEmulator = true;
    const emulator = spawn("emulator", ["-avd", avd, "-no-snapshot", "-no-boot-anim", "-no-audio"], {
      env,
      shell: isWindows,
      stdio: "ignore",
    });
    emulator.on("error", (error) => console.error(error));
    await waitFor("the emulator to connect", () => (serial = findDevice()) !== null, 420_000);
  }
  console.log(`Using device ${serial}`);
  await waitFor("Android to finish booting", () => adb("shell", "getprop", "sys.boot_completed").stdout?.trim() === "1", 420_000);

  // A sleeping screen hides the app from Maestro: keep it awake and unlocked.
  adb("shell", "svc", "power", "stayon", "true");
  adb("shell", "settings", "put", "system", "screen_off_timeout", "2147483647");
  adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  adb("shell", "input", "keyevent", "82");

  console.log("Installing the APK ...");
  const install = spawnSync("adb", ["-s", serial, "install", "-r", apk], { env, stdio: "inherit", shell: isWindows });
  if (install.status !== 0) throw new Error("adb install failed");

  console.log("Running Maestro ...");
  const result = sh("maestro", ["--device", serial, "test", join(root, ".maestro")], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  cleanup();
}
