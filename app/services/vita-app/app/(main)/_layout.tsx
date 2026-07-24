import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../../src/auth/useAuth";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet } from "../../src/capture/CaptureSheet";
import { startReconnectDrain } from "../../src/db/reconnect";
import { CheckinSheet } from "../../src/habits/CheckinSheet";
import { NavDots } from "../../src/nav/NavDots";
import { TabsPager } from "../../src/nav/TabsPager";
import { ReviewSheet } from "../../src/review/ReviewSheet";
import { colors, ToastHost } from "../../src/ui";

/** Main app shell: every screen here gets the always-present capture pill. */
export default function MainLayout() {
  // Sign-out anywhere in the app clears the session → bounce to sign-in.
  const authed = useAuth();
  // Drain the outbox on regained connectivity (parked writes + offline interpretations).
  useEffect(() => startReconnectDrain(), []);
  if (!authed) return <Redirect href="/auth" />;

  return (
    <CaptureProvider>
      {/* Push/detail screens fade + rise in (`fade_from_bottom`) to match the
          prototype's screen grammar: every detail screen uses `vtIn` (fade +
          translateY 16→0 over .3s), NOT a lateral slide (APP-064 — the lateral
          `vtSlideIn` is only the prototype's fake tab nav, which our real pager
          replaces). The three top-level tabs stay `animation:"none"` placeholders —
          TabsPager renders them above this Stack and owns the swipe, untouched. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="today" options={{ animation: "none" }} />
        <Stack.Screen name="home" options={{ animation: "none" }} />
        <Stack.Screen name="trends" options={{ animation: "none" }} />
        <Stack.Screen name="workout" options={{ animation: "none" }} />
        <Stack.Screen name="habits" options={{ animation: "none" }} />
        <Stack.Screen name="integrations" options={{ animation: "none" }} />
        {/* Account: prototype opens it with `vtIn` (soft fade + tiny rise, .3s ease) —
            the global `fade_from_bottom` felt heavy/slow. A plain `fade` cross-fade at
            240ms reads smoother + faster, closest native match. Scoped here so other
            detail screens (plan-setup, meal/workout) keep `fade_from_bottom`. */}
        <Stack.Screen name="account" options={{ animation: "fade", animationDuration: 240 }} />
      </Stack>
      <TabsPager />
      <NavDots />
      <CapturePill />
      <CaptureSheet />
      <CheckinSheet />
      <ReviewSheet />
      <ToastHost />
    </CaptureProvider>
  );
}
