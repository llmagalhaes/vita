/**
 * C2 regression — `isRetro` must compare LOCAL calendar days.
 *
 * `rec.at` is a local wall-clock slot serialised with `toISOString()`; `rec.loggedAt`
 * is the server's UTC receive time. Slicing both to 10 chars compared **UTC** days, so
 * at UTC−3 (the CEO's zone) every close after ~21:00 crossed UTC midnight and stamped
 * the day "closed later, by you" — a false claim in the one place the product makes an
 * honesty claim, and the thing that replaced the Trends week detail with a single line.
 *
 * The suite cannot force a zone: jest's VM sandbox resolves the local zone before any
 * test file runs, so `process.env.TZ` inside one is inert (verified). Instead every
 * case below is derived from the *running* zone's offset, which makes this stronger
 * than pinning one city — it asserts the property in whatever zone the gate runs in,
 * and both failure directions the review names are covered.
 */
import { atMinutes, minutesOf, ZERO, type MealRecord } from "../record";
import { isRetro } from "../state";

const DATE = "2026-08-19";

const rec = (time: string, loggedAt: string): MealRecord => ({
  entryId: `meal:${DATE}:m-1`,
  planMealId: "m-1",
  title: "Breakfast",
  state: "done",
  items: [],
  totals: { ...ZERO },
  at: atMinutes(DATE, minutesOf(time)),
  loggedAt,
});

/** The UTC instant of a local wall clock on `DATE + dayOffset`. */
const loggedLocally = (dayOffset: number, h: number, m = 0): string => {
  const d = new Date(`${DATE}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** Minutes WEST of UTC: > 0 in the Americas, < 0 in Europe/Asia. */
const westOfUtc = new Date(`${DATE}T12:00:00`).getTimezoneOffset();

test("a same-evening close is never retro, whatever the zone", () => {
  expect(isRetro(rec("08:00", loggedLocally(0, 21, 30)))).toBe(false); // breakfast
  expect(isRetro(rec("20:00", loggedLocally(0, 21, 30)))).toBe(false); // dinner
});

test("a next-morning close is retro, whatever the zone", () => {
  expect(isRetro(rec("08:00", loggedLocally(1, 7, 30)))).toBe(true);
});

test("a record that never reached the server derives nothing", () => {
  const { loggedAt: _unsynced, ...local } = rec("08:00", loggedLocally(0, 21, 30));
  expect(isRetro(local as MealRecord)).toBe(false);
});

// The two cases where the UTC day and the local day genuinely disagree — one of them
// exists in every zone but UTC, and each is a bug the ISO slice actually shipped.
const it_ = (applies: boolean) => (applies ? test : test.skip);

it_(westOfUtc > 0)("west of UTC: a late-evening close crossing UTC midnight is NOT retro", () => {
  // e.g. UTC−3, 21:30 local on the 19th = 00:30Z on the 20th. The slice said retro.
  const loggedAt = loggedLocally(0, 23, 30);
  expect(loggedAt.slice(0, 10) > DATE).toBe(true); // the UTC day really did roll over
  expect(isRetro(rec("08:00", loggedAt))).toBe(false);
});

it_(westOfUtc < 0)("east of UTC: a genuine next-day close before UTC midnight IS retro", () => {
  // e.g. UTC+2, 01:00 local on the 20th = 23:00Z on the 19th. The slice said same-day.
  const loggedAt = loggedLocally(1, 1, 0);
  expect(loggedAt.slice(0, 10)).toBe(DATE); // the UTC day had not rolled over yet
  expect(isRetro(rec("08:00", loggedAt))).toBe(true);
});
