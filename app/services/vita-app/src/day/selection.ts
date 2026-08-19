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
