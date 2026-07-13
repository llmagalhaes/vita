import {
  Nunito_200ExtraLight,
  Nunito_300Light,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/nunito";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { api, isMockApi } from "../src/api";
import { load as loadSession } from "../src/auth/session";
import { useAuthReady } from "../src/auth/useAuth";
import { getDb } from "../src/db/db";
import { drainOutbox } from "../src/db/outbox";
import { seedDemoDataOnce } from "../src/db/seed";
import { colors } from "../src/ui";
import "../src/i18n";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_200ExtraLight,
    Nunito_300Light,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Open/migrate the db once, seed the mock-mode demo log, drain leftovers,
  // and read the stored session from secure-store before gating navigation.
  useState(() => {
    getDb();
    if (isMockApi) seedDemoDataOnce();
    void drainOutbox(api).catch(() => {});
    void loadSession();
  });

  const authReady = useAuthReady();
  if (!fontsLoaded || !authReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </GestureHandlerRootView>
  );
}
