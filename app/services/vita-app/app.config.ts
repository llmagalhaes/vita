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
    // Voice capture (APP-012). Real recognition needs a dev build (not Expo Go);
    // the copy lives here now so the manifest is ready when APP-007 lands.
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Vita uses the microphone so you can speak what you had instead of typing. Audio never leaves your device.",
      NSSpeechRecognitionUsageDescription:
        "Vita turns your speech into text on your device to log meals, water and workouts. Only the text is used.",
      // Photo capture (APP-020 + CEO #6 camera source). Works in Expo Go; copy ready for dev builds.
      NSPhotoLibraryUsageDescription:
        "Vita reads a photo of your plate or gym whiteboard to draft an entry. The image is read once and never stored.",
      NSCameraUsageDescription:
        "Vita reads a photo of your plate or gym whiteboard to draft an entry. The image is read once and never stored.",
    },
  },
  android: {
    package: "com.llmagal.vita",
    // voice capture (APP-012) + camera photo source (CEO #6)
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.CAMERA"],
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
  plugins: [
    "expo-router",
    "expo-font",
    "expo-sqlite",
    "expo-secure-store",
    "expo-image-picker",
    "expo-notifications", // local habit check-in reminders (APP-026); scheduling works in Expo Go
    "expo-sharing", // on-device export share sheet (APP-031); inert in Expo Go
    "react-native-health-connect", // HC permissions-rationale intent-filter (APP-038); dev-build only
    "./plugins/withHealthConnect", // HC read permissions + <queries> + minSdk 26 (CNG-safe)
  ],
};

export default config;
