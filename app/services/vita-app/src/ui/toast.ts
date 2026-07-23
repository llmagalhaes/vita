/**
 * App-wide toast (APP-055, prototype `toast()` line 2364). One dark pill above the
 * tab bar that confirms an action ("Habit removed", "Vacation mode on — …", "Added
 * from your photo — ~N kcal") and auto-hides; a new toast replaces the current one.
 * Module store (mirrors sheetPresence) so ANY code can fire it without threading a
 * context — capture flows route through `showToast` too, so there is one host, not
 * two. Render <ToastHost/> once in the app shell.
 *
 * v3 (APP-083): an optional `undo` action. With an undo the pill stays a little
 * longer (3600ms vs 2200ms) and renders an "Undo" affordance; tapping it clears the
 * toast and runs the callback once. A replacement toast cancels the prior undo.
 */
import { useSyncExternalStore } from "react";

const AUTO_HIDE_MS = 2200;
const AUTO_HIDE_UNDO_MS = 3600; // longer window when an Undo is offered (handoff §7)

export type Toast = { text: string; undo?: () => void };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, opts?: { undo?: () => void }): void {
  if (timer) clearTimeout(timer);
  current = { text: message, undo: opts?.undo };
  emit();
  timer = setTimeout(
    () => {
      current = null;
      timer = null;
      emit();
    },
    opts?.undo ? AUTO_HIDE_UNDO_MS : AUTO_HIDE_MS,
  );
}

/** Dismiss the current toast now (used by the Undo tap). */
function hideToast(): void {
  if (timer) clearTimeout(timer);
  current = null;
  timer = null;
  emit();
}

/** Run the current toast's undo (if any), then dismiss. Idempotent per toast. */
export function runToastUndo(): void {
  const undo = current?.undo;
  hideToast();
  undo?.();
}

/** Current toast (or null). Exposed for the store test; the hook below reads it too. */
export const getToast = (): Toast | null => current;

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getToast,
    getToast,
  );
}
