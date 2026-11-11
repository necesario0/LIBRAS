// Builds a release APK: generates the native project with `expo prebuild`
// (the android/ folder is generated, never committed), then runs Gradle.
// Output: apps/mobile/build/libras.apk. Set EXPO_PUBLIC_API_URL to point the
// APK at a different API (default: the emulator's alias for the host, port 3000).
//
// On Windows the native build (CMake) fails when the repository path is long,
// so CMake output goes to a short folder through a Gradle init script.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { androidEnv } from "./env.mjs";

const realRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env, isWindows } = androidEnv();
const abis = process.env.LIBRAS_ABIS ?? "arm64-v8a,x86,x86_64";

const nativeBuildDir = process.env.LIBRAS_NATIVE_BUILD_DIR ?? join(process.env.SystemDrive ?? "C:", "/lb");
const root = realRoot;
env.LIBRAS_NATIVE_BUILD_DIR = nativeBuildDir;
env.LIBRAS_CMAKE_VERSION = process.env.LIBRAS_CMAKE_VERSION ?? "3.31.6";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

try {
  run("npx", ["expo", "prebuild", "--platform", "android", "--no-install", "--clean"], root);
  run(
    `"${join(root, "android", isWindows ? "gradlew.bat" : "gradlew")}"`,
    ["assembleRelease", "-I", `"${join(root, "scripts", "short-native-build.init.gradle")}"`, `-PreactNativeArchitectures=${abis}`, "--no-daemon"],
    join(root, "android"),
  );
  mkdirSync(join(realRoot, "build"), { recursive: true });
  copyFileSync(
    join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    join(realRoot, "build", "libras.apk"),
  );
  console.log(`\nAPK ready: ${join(realRoot, "build", "libras.apk")}`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
