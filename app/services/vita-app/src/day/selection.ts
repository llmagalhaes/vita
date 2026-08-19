/**
 * Which day the Day panel is showing. A module store (same shape as `ui/toast`) so
 * the dock date picker, the timeline and the capture pill share one truth without a
 * context. Defaults to today and resets to today on every app start — a past day is
 * something you navigate to, never somewhere you wake up.
 *
 * APP-104 needs it for one rule: the capture pill exists only on TODAY's Day panel.
 * APP-099 (dock / calendar) is the writer.
 * ponytail: no persistence, no date object — the local `YYYY-MM-DD` key is enough.
 */
import { useSyncExternalStore } from "react";
import { dayKey } from "./record";

let selected: string = dayKey();
/**
 * The calendar day that was "today" when `selected` was last chosen. It is what tells
 * a user sitting on today apart from one who travelled: only the former must roll over
 * when the app is left open across midnight.
 */
let anchor: string = selected;
const listeners = new Set<() => void>();

export const getSelectedDate = (): string => selected;

export function setSelectedDate(date: string): void {
  anchor = dayKey();
  if (date === selected) return;
  selected = date;
  listeners.forEach((l) => l());
}

/**
 * Midnight rollover. `selected` was frozen at module load, so an app backgrounded
 * overnight woke up on "yesterday": PastDay instead of the day, every today-only zone
 * hidden and no capture pill. Returns true when it moved. Travelling is respected —
 * a day the user navigated to stays put.
 */
export function rollOverToToday(now: Date = new Date()): boolean {
  const today = dayKey(now);
  if (selected === today || selected !== anchor) return false;
  setSelectedDate(today);
  return true;
}

/** Mount-time wiring: roll over whenever the app comes back to the foreground. */
export function startDayRollover(): () => void {
  const { AppState } = require("react-native") as typeof import("react-native");
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") rollOverToToday();
  });
  return () => sub.remove();
}

export function useSelectedDate(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSelectedDate,
    getSelectedDate,
  );
}

/** True while the panel is on today (the only day capture may write to). */
export const isSelectedDayToday = (): boolean => selected === dayKey();

// ── day offsets (0 = today) — what every "Open this day →" caller carries ──────
// The dock, the muscle sheet's session rows, the habit sheet's calendar and the
// Trends week detail all speak in offsets, so the conversion lives here once.

export const dateForOffset = (offset: number, today: Date = new Date()): string =>
  dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));

export const offsetForDate = (date: string, today: Date = new Date()): number => {
  const [y, m, d] = date.split("-").map(Number);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((midnight - new Date(y!, (m ?? 1) - 1, d ?? 1).getTime()) / 86_400_000);
};

/** Travel the Day panel to a day given as an offset (0 = today). */
export const setSelectedOffset = (offset: number): void => setSelectedDate(dateForOffset(offset));

export const getSelectedOffset = (): number => offsetForDate(selected);
