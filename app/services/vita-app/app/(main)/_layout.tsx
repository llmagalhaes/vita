import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../../src/auth/useAuth";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet } from "../../src/capture/CaptureSheet";
import { startReconnectDrain } from "../../src/db/reconnect";
import { CheckinSheet } from "../../src/habits/CheckinSheet";
import { PanelShell } from "../../src/nav/PanelShell";
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
        {/* v3 routes still reachable from not-yet-rewritten call sites; they
            redirect to /day (APP-108 removes them). */}
        <Stack.Screen name="today" options={{ animation: "none" }} />
        <Stack.Screen name="home" options={{ animation: "none" }} />
        <Stack.Screen name="habits" options={{ animation: "none" }} />
        <Stack.Screen name="integrations" options={{ animation: "none" }} />
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
      <CheckinSheet />
      <ReviewSheet />
      <ToastHost />
    </CaptureProvider>
  );
}
