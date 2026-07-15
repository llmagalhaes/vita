/**
 * App-wide "is a bottom-sheet / pop-up open?" signal (CEO batch #1). The capture
 * pill (the floating tab bar) subscribes and hides itself while any sheet is up —
 * the prototype's menu disappears under a sheet (image 2). One shared counter so
 * it works no matter which sheet is open (SheetOverlay-based ones and the three
 * hand-rolled Capture/Check-in/Review sheets alike).
 */
import { useEffect } from "react";
import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Register a sheet as present while `visible`. Balances itself on unmount. */
export function useSheetPresence(visible: boolean): void {
  useEffect(() => {
    if (!visible) return;
    count += 1;
    emit();
    return () => {
      count = Math.max(0, count - 1);
      emit();
    };
  }, [visible]);
}

export function useAnySheetOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count > 0,
    () => count > 0,
  );
}
