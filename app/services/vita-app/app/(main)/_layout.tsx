import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../../src/auth/useAuth";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet, CaptureToast } from "../../src/capture/CaptureSheet";
import { startReconnectDrain } from "../../src/db/reconnect";
import { CheckinSheet } from "../../src/habits/CheckinSheet";
import { TabsPager } from "../../src/nav/TabsPager";
import { ReviewSheet } from "../../src/review/ReviewSheet";
import { colors } from "../../src/ui";

/** Main app shell: every screen here gets the always-present capture pill. */
export default function MainLayout() {
  // Sign-out anywhere in the app clears the session → bounce to sign-in.
  const authed = useAuth();
  // Drain the outbox on regained connectivity (parked writes + offline interpretations).
  useEffect(() => startReconnectDrain(), []);
  if (!authed) return <Redirect href="/auth" />;

  return (
    <CaptureProvider>
      {/* Push/detail screens slide natively. The three top-level tabs are null
          placeholders here (animation:"none") — TabsPager renders them, mounted
          above this Stack, and is the visible/interactive layer on tab routes. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="home" options={{ animation: "none" }} />
        <Stack.Screen name="trends" options={{ animation: "none" }} />
        <Stack.Screen name="habits" options={{ animation: "none" }} />
      </Stack>
      <TabsPager />
      <CapturePill />
      <CaptureToast />
      <CaptureSheet />
      <CheckinSheet />
      <ReviewSheet />
    </CaptureProvider>
  );
}
