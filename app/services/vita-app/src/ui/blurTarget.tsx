/**
 * The one blur target for every Android BlurView. expo-blur SDK 56's Android
 * blur (`blurMethod="dimezisBlurView"`) silently falls back to NO blur unless
 * the BlurView is given a `blurTarget` ref to a BlurTargetView wrapping the
 * content it should blur — this was the real reason every earlier intensity /
 * reduction-factor tweak changed nothing on Android. The root layout wraps the
 * app content (not the overlay host) in <AppBlurTarget>, and SheetBackdrop /
 * PanelTabs pass `appBlurTarget` to their BlurViews. iOS ignores all of it —
 * its native blur needs no target (BlurTargetView is a plain View there).
 */
import { createRef, type ReactNode } from "react";
import { BlurTargetView } from "expo-blur";

export const appBlurTarget = createRef<any>();

export function AppBlurTarget({ children }: { children: ReactNode }) {
  return (
    <BlurTargetView ref={appBlurTarget} style={{ flex: 1 }}>
      {children}
    </BlurTargetView>
  );
}
