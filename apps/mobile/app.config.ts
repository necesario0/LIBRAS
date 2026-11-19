import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";
import { withGradleProperties } from "expo/config-plugins";

// Plain http is only allowed when the app is pointed at an http API (local
// development and the emulator test). A build against an https API, such as
// the one on Render, keeps Android's default of blocking cleartext traffic.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
const allowCleartext = apiUrl.startsWith("http://") || apiUrl === "";

// Push notifications (ticket #54) reach an Android phone through Expo's push
// service and Firebase Cloud Messaging. A build gets them only with both:
// - the Firebase app's google-services.json (GOOGLE_SERVICES_JSON names it, or
//   apps/mobile/google-services.json; never committed), and
// - the Expo project id (EXPO_PROJECT_ID), which Expo's push service keys tokens to.
// Without either, or with LIBRAS_PUSH=off (the emulator test builds), the app
// builds and runs as before: it never asks for the notification permission and
// never registers the phone. See docs/push-notifications.md for the owner's steps.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync("./google-services.json") ? "./google-services.json" : undefined);
const expoProjectId = process.env.EXPO_PROJECT_ID || undefined;
const pushEnabled = process.env.LIBRAS_PUSH !== "off" && googleServicesFile !== undefined && expoProjectId !== undefined;

const config: ExpoConfig = {
  name: "LIBRAS",
  slug: "libras",
  scheme: "libras",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/libras-logo.png",
  android: {
    package: "ph.edu.umak.libras",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/images/libras-adaptive-foreground.png",
      backgroundColor: "#005DC3",
    },
    ...(pushEnabled ? { googleServicesFile } : {}),
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    // The launch screen: the LIBRAS logo on white. _layout.tsx keeps it up while the stored session is restored.
    ["expo-splash-screen", { image: "./assets/images/libras-splash.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#FFFFFF" }],
    ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
    // The small icon in the status bar must be white on transparent; the channel matches the API's pushes.
    ["expo-notifications", { icon: "./assets/images/libras-notification-icon.png", color: "#005DC3", defaultChannel: "default" }],
  ],
  extra: {
    pushEnabled,
    ...(expoProjectId === undefined ? {} : { eas: { projectId: expoProjectId } }),
  },
  experiments: { typedRoutes: true },
};

// R8 minification runs out of Expo's default 512 MiB JVM metaspace once expo-notifications is linked.
const GRADLE_JVM_ARGS = "-Xmx2048m -XX:MaxMetaspaceSize=1024m";

export default withGradleProperties(config, (gradleConfig) => {
  const existing = gradleConfig.modResults.find((item) => item.type === "property" && item.key === "org.gradle.jvmargs");
  if (existing && existing.type === "property") {
    existing.value = GRADLE_JVM_ARGS;
  } else {
    gradleConfig.modResults.push({ type: "property", key: "org.gradle.jvmargs", value: GRADLE_JVM_ARGS });
  }
  return gradleConfig;
});
