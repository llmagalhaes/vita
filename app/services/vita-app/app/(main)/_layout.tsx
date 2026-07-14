import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/useAuth";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet, CaptureToast } from "../../src/capture/CaptureSheet";
import { CheckinSheet } from "../../src/habits/CheckinSheet";
import { colors } from "../../src/ui";

/** Main app shell: every screen here gets the always-present capture pill. */
export default function MainLayout() {
  // Sign-out anywhere in the app clears the session → bounce to sign-in.
  const authed = useAuth();
  if (!authed) return <Redirect href="/auth" />;

  return (
    <CaptureProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      <CapturePill />
      <CaptureToast />
      <CaptureSheet />
      <CheckinSheet />
    </CaptureProvider>
  );
}
