import type { ExpoConfig } from "expo/config";

// Plain http is only allowed when the app is pointed at an http API (local
// development and the emulator test). A build against an https API, such as
// the one on Render, keeps Android's default of blocking cleartext traffic.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
const allowCleartext = apiUrl.startsWith("http://") || apiUrl === "";

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
      foregroundImage: "./assets/images/libras-logo.png",
      backgroundColor: "#FFFFFF",
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    // The launch screen: the LIBRAS logo on white. _layout.tsx keeps it up while the stored session is restored.
    ["expo-splash-screen", { image: "./assets/images/libras-logo.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#FFFFFF" }],
    ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
