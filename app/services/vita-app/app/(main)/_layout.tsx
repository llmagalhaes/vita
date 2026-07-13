import { Stack } from "expo-router";
import { CaptureProvider } from "../../src/capture/CaptureContext";
import { CapturePill } from "../../src/capture/CapturePill";
import { CaptureSheet, CaptureToast } from "../../src/capture/CaptureSheet";
import { colors } from "../../src/ui";

/** Main app shell: every screen here gets the always-present capture pill. */
export default function MainLayout() {
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
    </CaptureProvider>
  );
}
