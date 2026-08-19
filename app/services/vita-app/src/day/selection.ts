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
const listeners = new Set<() => void>();

export const getSelectedDate = (): string => selected;

export function setSelectedDate(date: string): void {
  if (date === selected) return;
  selected = date;
  listeners.forEach((l) => l());
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
