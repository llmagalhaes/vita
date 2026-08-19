import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../../src/auth/useAuth";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet } from "../../src/capture/CaptureSheet";
import { startAppSync } from "../../src/db/bootstrap";
import { startReconnectDrain } from "../../src/db/reconnect";
import { startDayRollover } from "../../src/day/selection";
import { startDayClose } from "../../src/notify/dayClose";
import { PanelShell } from "../../src/nav/PanelShell";
import { ReviewSheet } from "../../src/review/ReviewSheet";
import { colors, ToastHost } from "../../src/ui";

/** Main app shell: every screen here gets the always-present capture pill. */
export default function MainLayout() {
  // Sign-out anywhere in the app clears the session → bounce to sign-in.
  const authed = useAuth();
  // Drain the outbox on regained connectivity (parked writes + offline interpretations).
  useEffect(() => startReconnectDrain(), []);
  // APP-106: schedule today's day-close notification, keep its body in step with the
  // log, and route its two actions. One notification a day — nothing else is pushed.
  useEffect(() => startDayClose(), []);
  // Left open across midnight, the Day panel must wake up on the new day, not on the
  // one it was frozen at.
  useEffect(() => startDayRollover(), []);
  // Launch-time hydration (plan/program/vacation/log restore). Gated on the session:
  // firing it before the bearer is in memory would just 401 into a backoff (APP-061).
  useEffect(() => {
    if (authed) startAppSync();
  }, [authed]);
  if (!authed) return <Redirect href="/auth" />;

  return (
    <CaptureProvider>
      {/* Push/detail screens fade + rise in (`fade_from_bottom`) to match the
          prototype's screen grammar: every detail screen uses `vtIn` (fade +
          translateY 16→0 over .3s), NOT a lateral slide (APP-064 — the lateral
          `vtSlideIn` is only the prototype's fake tab nav, which our real pager
          replaces). The three panels stay `animation:"none"` placeholders —
          PanelShell renders them above this Stack and owns the swipe, untouched. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="trends" options={{ animation: "none" }} />
        <Stack.Screen name="day" options={{ animation: "none" }} />
        <Stack.Screen name="library" options={{ animation: "none" }} />
        {/* Account: prototype opens it with `vtIn` (fade + translateY 16→0, .3s ease).
            A plain native `fade` dropped the rise (CEO: still "estranha"); `fade_from_bottom`
            was too heavy. Fix = native `fade` owns the opacity (push AND pop, so back gets a
            graceful cross-fade) + account.tsx adds a transform-only 16px rise via Reanimated —
            orthogonal to the native fade (which never moves the screen), so together they
            reproduce vtIn exactly. Scoped here so other detail screens keep `fade_from_bottom`. */}
        <Stack.Screen name="account" options={{ animation: "fade", animationDuration: 300 }} />
      </Stack>
      <PanelShell />
      <CapturePill />
      <CaptureSheet />
      <ReviewSheet />
      <ToastHost />
    </CaptureProvider>
  );
}
