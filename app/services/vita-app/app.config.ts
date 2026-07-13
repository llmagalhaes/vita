import type { ExpoConfig } from "expo/config";

// ponytail: one constant on purpose — "Vita" is an internal codename (CEO Round 5).
// The store-facing display name is TBD and must only ever change here.
const DISPLAY_NAME = "Vita";

const config: ExpoConfig = {
  name: DISPLAY_NAME,
  slug: "vita",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light", // light-only in v1 (CEO Round 5)
  scheme: "vita", // deep links: vita:// (auth callback vita://auth)
  // New Architecture is the SDK default — no flag needed (ADR-0001).
  ios: {
    bundleIdentifier: "com.llmagal.vita",
    supportsTablet: false, // phone-only (CEO Round 5)
  },
  android: {
    package: "com.llmagal.vita",
    adaptiveIcon: {
      backgroundColor: "#EDE5D6",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  extra: {
    // Single environment: production. Set at build time, never hardcoded:
    //   VITA_API_BASE_URL=https://<api-gateway-id>.execute-api.<region>.amazonaws.com/v1
    apiBaseUrl: process.env.VITA_API_BASE_URL ?? "",
  },
  plugins: ["expo-router", "expo-font", "expo-sqlite"],
};

export default config;
