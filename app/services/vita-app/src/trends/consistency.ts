/**
 * Trends consistency (APP-090) — "N weeks in a row of showing up", phrased
 * ordinally and NEVER as a number (product non-negotiable). It disappears rather
 * than resets: below 2 the card simply isn't rendered, so there is no zero state.
 *
 * A week fully covered by vacation bridges the chain (an absence you chose isn't a
 * gap); the current week counts as soon as it has one log so far. Pure — the DB
 * and vacation adapters are injected so the walk is unit-tested without a device.
 */

/** Monday 00:00 of the week containing `d` (weeks are Monday-based). */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const mondayOffset = (s.getDay() + 6) % 7; // Sun=6, Mon=0 … Sat=5
  s.setDate(s.getDate() - mondayOffset);
  return s;
}

/**
 * Count consecutive weeks (walking back from `today`'s week) that have ≥1 log,
 * with fully-vacation weeks bridging the chain without counting. Stops at the
 * first non-vacation week with no logs. Bounded by `maxWeeks`.
 */
export function consecutiveLogWeeks(
  today: Date,
  weekHasLog: (start: Date, end: Date) => boolean,
  isVacationWeek: (start: Date, end: Date) => boolean,
  maxWeeks = 12,
): number {
  let n = 0;
  let start = weekStart(today);
  for (let i = 0; i < maxWeeks; i++) {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    if (isVacationWeek(start, end)) {
      // bridge — neither counts nor breaks the chain
    } else if (weekHasLog(start, end)) {
      n++;
    } else {
      break;
    }
    start = new Date(start);
    start.setDate(start.getDate() - 7);
  }
  return n;
}

/** i18n key for the ordinal phrase — `many` beyond the enumerated weeks. */
export function consistencyKey(n: number): string {
  return n > 12 ? "trends.consistency.many" : `trends.consistency.w${n}`;
}
