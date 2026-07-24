/**
 * Minimal portal host for centered pop-ups (PopOverlay). A pop declared deep inside
 * a screen's ScrollView can't center on the viewport — `position:absolute` resolves
 * against the tall scroll content, so the card sinks to the middle of the *content*,
 * not the screen (the CEO's "abre fora de foco"). RN `Modal` escapes the ScrollView
 * but ANRs on Android with Reanimated + gesture-handler, so instead PopOverlay
 * renders its overlay through this host, mounted ONCE at the app root INSIDE the
 * GestureHandlerRootView — so the card centers on the screen and the slider's Pan
 * still fires (same gesture root, no separate window). Mirrors the toast store.
 */
import { type ReactNode, useSyncExternalStore } from "react";

const nodes = new Map<string, ReactNode>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** PopOverlay pushes its overlay under a stable per-instance id; null clears it. */
export function setPopNode(id: string, node: ReactNode): void {
  if (node == null) nodes.delete(id);
  else nodes.set(id, node);
  emit();
}

// A new array only when the set of nodes changes, so useSyncExternalStore is stable.
let snapshot: ReactNode[] = [];
function getSnapshot(): ReactNode[] {
  const next = Array.from(nodes.values());
  const same = next.length === snapshot.length && next.every((n, i) => n === snapshot[i]);
  if (!same) snapshot = next;
  return snapshot;
}

/** Render once at the app root (inside GestureHandlerRootView). */
export function PopHost() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    getSnapshot,
  );
  return <>{list}</>;
}
