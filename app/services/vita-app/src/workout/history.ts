/**
 * Workout history rows (APP-081): captured workout entries + Health Connect
 * exercise sessions, merged newest-first. HC rows carry NO kcal (our reader only
 * has day-aggregated active energy — don't fake per-session kcal) and empty
 * muscles/exercises. No de-dupe in v1 — a workout both captured and HC-recorded
 * lists twice, honestly credited (ponytail ceiling: heuristic only on CEO flag).
 */
import type { Muscle, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import type { HcSession } from "../health/healthConnect";

export type HistorySource = "capture" | "healthConnect";

export type HistoryRow = {
  key: string;
  date: string; // ISO — sort + date-tile
  title: string;
  muscles: Muscle[];
  durationMin?: number;
  kcal?: number;
  source: HistorySource;
  entry?: LocalEntry; // captured → opens its preview / detail
  session?: HcSession; // HC → preview via a minimal adapter
};

/**
 * Health Connect ExerciseType numeric code → i18n key suffix under
 * `health.exerciseType.*`. Total function — unknown codes fall back to "other".
 * Codes are the androidx Health Connect ExerciseSessionRecord constants.
 */
export function exerciseTypeKey(code: number | null): string {
  switch (code) {
    case 56:
      return "running";
    case 79:
      return "walking";
    case 8:
      return "cycling";
    case 73:
    case 74:
      return "swimming";
    case 70:
    case 81:
      return "strength";
    case 83:
      return "yoga";
    case 30:
      return "hiit";
    case 53:
    case 54:
      return "rowing";
    case 25:
      return "elliptical";
    default:
      return "other";
  }
}

const minutesBetween = (start: string, end: string): number => Math.max(0, Math.round((+new Date(end) - +new Date(start)) / 60000));

/**
 * Merge captured entries + HC sessions into display rows, newest first.
 * `sessionTitle` resolves an HC session's label (record title ?? exerciseType
 * name) — passed in so this stays pure (the i18n `t` lives in the caller).
 */
export function mergeHistory(
  entries: LocalEntry[],
  sessions: HcSession[],
  sessionTitle: (s: HcSession) => string,
): HistoryRow[] {
  const captured: HistoryRow[] = entries.map((e) => {
    const d = e.detail as WorkoutDetail;
    return {
      key: `cap-${e.id}`,
      date: e.occurredAt,
      title: d.title,
      muscles: (d.muscles ?? []) as Muscle[],
      durationMin: d.durationMin ?? undefined,
      kcal: d.kcal ?? undefined,
      source: "capture",
      entry: e,
    };
  });
  const hc: HistoryRow[] = sessions.map((s) => ({
    key: `hc-${s.id}`,
    date: s.start,
    title: sessionTitle(s),
    muscles: [],
    durationMin: minutesBetween(s.start, s.end),
    kcal: undefined, // never faked for HC rows
    source: "healthConnect",
    session: s,
  }));
  return [...captured, ...hc].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
