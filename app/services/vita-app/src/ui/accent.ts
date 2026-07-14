/**
 * Single state-driven accent token (APP-030). The whole app reads its accent
 * through here so vacation mode can flip ONE switch to the sea tone instead of
 * forking the theme. `getAccent()` for non-component code, `useAccent()` for
 * reactive chrome. Vacation start/end (src/db/vacation.ts) calls setVacationAccent.
 *
 * ponytail: only the always-present chrome (capture pill, Home banner) subscribes
 * today — that's what visibly shifts tone. Any other screen opts in by swapping
 * `colors.accent` → `useAccent()`; the token source already drives it.
 */
import { useSyncExternalStore } from "react";
import { colors } from "./tokens";

const listeners = new Set<() => void>();
let vacation = false;

export function setVacationAccent(active: boolean): void {
  if (vacation === active) return;
  vacation = active;
  listeners.forEach((l) => l());
}

export const getAccent = (): string => (vacation ? colors.vacationAccent : colors.accent);

export function useAccent(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAccent,
  );
}
