/**
 * R19 (APP-142) — host for the pops the OS presents.
 *
 * `<PopOverlay native>` hands its card here and pushes `/pop`, a react-native-screens
 * **`transparentModal`** screen (`app/pop.tsx`) that renders it. The entrance is then
 * the platform's own `fade` (a fragment animation on Android, an over-full-screen
 * presentation on iOS) instead of a JS tween sharing the frame with the card's first
 * layout — the CEO's stutter, after two custom rounds (R18-A measured the entrance and
 * still lost).
 *
 * RN `Modal` is still FORBIDDEN (session 21: Reanimated + gesture-handler deadlock →
 * ANR). A screens modal is a real screen inside the SAME `GestureHandlerRootView`, not
 * a separate window, so PortionPop's slider Pan keeps working.
 *
 * Why a store and not route params: the pops carry live callbacks (`onChangeQty`,
 * `onSkip`, `onClose`) and plan objects, and their owner keeps the state. Same shape as
 * `popHost` — the owner pushes its node on every render, so the closures stay fresh.
 *
 * ONE pop screen at a time (the app never stacks pops). The entry is id-OWNED because
 * a Day timeline renders one `PopOverlay` per meal: the four closed siblings must not
 * be able to clear the one that is open.
 */
import { type MutableRefObject, type ReactNode, useEffect, useSyncExternalStore } from "react";

/** `close` is a REF, never a value: the screen outlives the owner's `visible` (it is
 *  still fading out), and the close it fires on unmount must be the owner's LATEST one
 *  — the stale one from the open render would re-apply the write it already made. */
/** The route `app/pop.tsx` sits at. One constant: `PopOverlay` pushes it and
 *  `PanelShell` keeps the panels drawn under it. */
export const POP_ROUTE = "/pop";

type Entry = { id: string; node: ReactNode; close: MutableRefObject<() => void> };

let current: Entry | null = null;
let mounted = false; // the /pop screen is actually on the stack
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Push this owner's pop content (or clear it, with `node == null`). The entry is NOT
 * cleared when the pop closes — the screen has to keep drawing the card through the
 * OS fade-out; `PopScreenContent`'s unmount is what clears it.
 */
export function setPopScreen(id: string, node: ReactNode, close: MutableRefObject<() => void>): void {
  if (node == null) {
    if (current?.id !== id) return; // not ours to clear — no re-render either
    current = null;
  } else {
    current = { id, node, close };
  }
  emit();
}

/** True while `/pop` is on the stack — the owner must not `router.back()` otherwise
 *  (a screen dismissed from the inside is already gone, and popping again would take
 *  the panel underneath with it). */
export const isPopScreenOpen = (): boolean => mounted;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => current;

/**
 * The `/pop` route's body — exported here so tests can mount it without a router
 * (the same trick as `<PopHost />`).
 */
export function PopScreenContent() {
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    mounted = true;
    return () => {
      mounted = false;
      // Every way out ends here — backdrop press, Android hardware back, iOS swipe —
      // so the owner's `visible` always follows the screen. Cleared BEFORE the call so
      // the owner's own close path can't try to pop an already-gone screen.
      const close = current?.close;
      current = null;
      close?.current();
    };
  }, []);
  return <>{entry?.node ?? null}</>;
}
