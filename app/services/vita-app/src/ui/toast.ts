/**
 * App-wide toast (APP-055, prototype `toast()` line 2364). One dark pill above the
 * tab bar that confirms an action ("Habit removed", "Vacation mode on — …", "Added
 * from your photo — ~N kcal") and auto-hides after 2200ms; a new toast replaces the
 * current one. Module store (mirrors sheetPresence) so ANY code can fire it without
 * threading a context — capture flows route through `showToast` too, so there is one
 * host, not two. Render <ToastHost/> once in the app shell.
 */
import { useSyncExternalStore } from "react";

const AUTO_HIDE_MS = 2200;
let current: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string): void {
  if (timer) clearTimeout(timer);
  current = message;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, AUTO_HIDE_MS);
}

/** Current toast text (or null). Exposed for the store test; the hook below reads it too. */
export const getToast = (): string | null => current;

export function useToast(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getToast,
    getToast,
  );
}
