/**
 * A light "selection" haptic tick — the prototype's `navigator.vibrate(7)`
 * fired once per dock-dot crossing (Home v2).
 *
 * expo-haptics is bundled in Expo Go and gives the correct platform-native
 * selection feedback (iOS taptic selection; Android short vibration). Lazily
 * required + fully swallowed so tests never load it and unsupported platforms
 * simply no-op — same stub-seam pattern as the notifier/voice recognizers.
 * Never call from a worklet directly — go through runOnJS.
 */
export function selectionTick(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    void require("expo-haptics").selectionAsync?.();
  } catch {
    // ponytail: haptics unavailable (jest / web / unsupported) → silent no-op.
  }
}
