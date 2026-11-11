// Shared by the build and end-to-end scripts: finds the Android toolchain.
// Every location can be overridden with the usual environment variables.
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const isWindows = process.platform === "win32";

function firstExisting(candidates) {
  return candidates.find((path) => path && existsSync(path));
}

export function androidEnv() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const androidHome = firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    join(home, "Android", "Sdk"),
  ]);
  const javaHome = firstExisting([
    process.env.JAVA_HOME,
    "C:/Program Files/Android/Android Studio/jbr",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ]);
  const maestroBin = firstExisting([
    process.env.MAESTRO_HOME && join(process.env.MAESTRO_HOME, "bin"),
    join(home, "tools", "maestro", "bin"),
    join(home, ".maestro", "bin"),
  ]);
  if (!androidHome) throw new Error("Android SDK not found. Set ANDROID_HOME.");
  if (!javaHome) throw new Error("JDK not found. Set JAVA_HOME (Android Studio's jbr works).");
  const path = [
    join(javaHome, "bin"),
    join(androidHome, "platform-tools"),
    join(androidHome, "emulator"),
    maestroBin,
    process.env.PATH ?? process.env.Path,
  ]
    .filter(Boolean)
    .join(delimiter);
  const env = { ...process.env, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome, JAVA_HOME: javaHome };
  // Windows env names are case-insensitive but Node keeps both spellings: set the one spawn uses.
  delete env.Path;
  env.PATH = path;
  return { env, androidHome, javaHome, isWindows };
}
