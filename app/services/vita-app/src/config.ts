import Constants from "expo-constants";

/** API base URL from build config (app.config.ts extra). Empty in dev until set. */
export const apiBaseUrl: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "";
