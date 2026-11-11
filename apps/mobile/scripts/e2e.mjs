// Emulator end-to-end test: boots the emulator if needed, makes sure the API
// is up, installs build/libras.apk and runs every Maestro flow in .maestro/.
// Needs the local database running (npm run db:start) and `npm run build:apk`
// done. Hold the shared database lock while this runs (see the README).
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sh = (command, args, options = {}) =>
  spawnSync(command, args, { env, encoding: "utf8", shell: isWindows, ...options });

function hasDevice() {
  return /\tdevice\b/.test(sh("adb", ["devices"]).stdout ?? "");
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
  if (startedEmulator) sh("adb", ["emu", "kill"]);
}

async function main() {
  if (!existsSync(apk)) throw new Error(`${apk} not found. Run npm run build:apk -w @libras/mobile first.`);

  if (!(await apiIsUp())) {
    console.log("Starting the API ...");
    children.push(spawn(process.execPath, ["apps/api/src/server.ts"], { cwd: repoRoot, env, stdio: "inherit" }));
    await waitFor("the API (is the database running? npm run db:start)", apiIsUp, 60_000);
  }

  if (!hasDevice()) {
    console.log(`Starting the emulator ${avd} ...`);
    startedEmulator = true;
    const emulator = spawn("emulator", ["-avd", avd, "-no-snapshot", "-no-boot-anim", "-no-audio"], {
      env,
      shell: isWindows,
      stdio: "ignore",
      detached: false,
    });
    emulator.on("error", (error) => console.error(error));
    await waitFor("the emulator device", async () => hasDevice(), 180_000);
  }
  await waitFor("Android to finish booting", async () => sh("adb", ["shell", "getprop", "sys.boot_completed"]).stdout?.trim() === "1", 240_000);

  console.log("Installing the APK ...");
  const install = sh("adb", ["install", "-r", apk], { stdio: "inherit" });
  if (install.status !== 0) throw new Error("adb install failed");

  console.log("Running Maestro ...");
  const result = sh("maestro", ["test", join(root, ".maestro")], { stdio: "inherit" });
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
