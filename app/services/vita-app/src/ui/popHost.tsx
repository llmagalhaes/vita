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
import { Fragment, type ReactNode, useEffect, useId, useSyncExternalStore } from "react";

const nodes = new Map<string, ReactNode>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** PopOverlay pushes its overlay under a stable per-instance id; null clears it. */
export function setPopNode(id: string, node: ReactNode): void {
  if (node == null) nodes.delete(id);
  else nodes.set(id, node);
  emit();
}

/**
 * Portal `node` to the host while the caller is mounted, and always return null so
 * the caller renders nothing in place. Same reason as PopOverlay's: a sheet declared
 * inside a panel's ScrollView would anchor to the tall scroll CONTENT, not the screen.
 * (Added by APP-099 for the calendar + past-day muscle sheets, which live in the dock.)
 */
export function usePortal(node: ReactNode): null {
  const id = useId();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPopNode(id, node));
  useEffect(() => () => setPopNode(id, null), [id]);
  return null;
}

// A new array only when the set of nodes changes, so useSyncExternalStore is stable.
// `[id, node]`, not bare nodes: the id is the React KEY below (R18-B).
let snapshot: [string, ReactNode][] = [];
function getSnapshot(): [string, ReactNode][] {
  const next = Array.from(nodes.entries());
  const same = next.length === snapshot.length && next.every(([id, n], i) => snapshot[i]?.[0] === id && snapshot[i]?.[1] === n);
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
  // Keyed by the portal id, never by array position. The Map reorders whenever a
  // portal closes (a `null` node DELETES its key; reopening APPENDS it), so an
  // unkeyed array made React reconcile portal N against portal N-1's fiber — same
  // element type, different content: the surviving sheet's subtree gets torn down
  // and rebuilt, dropping the focused TextInput (keyboard falls) and replaying the
  // entrance animation ("a card out of nowhere"). Stable keys, no reconciliation.
  return <>{list.map(([id, node]) => <Fragment key={id}>{node}</Fragment>)}</>;
}
