/**
 * APP-102 — habit statistics. Pure math over real `checkin` entries; no db, no clock.
 */
import type { LocalEntry } from "../../db/entries";
import { dayKey } from "../../trends/aggregate";
import {
  MONTH_BARS,
  canOpenDay,
  doneDayKeys,
  habitStats,
  monthBarHeight,
  weekdayDiameter,
  weekdayOpacity,
} from "../stats";

// Fixed anchor: 2026-06-15 is a Monday, local noon so no tz day-flip.
const TODAY = new Date(2026, 5, 15, 12, 0, 0);
const HABIT = "h1";

const dayAt = (offset: number): Date => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - offset);
  d.setHours(9, 0, 0, 0);
  return d;
};

/** A check-in exactly as `answerCheckin` writes it: id = `habitId:YYYY-MM-DD`. */
function checkin(offset: number, answer = "yes", habitId = HABIT): LocalEntry {
  const at = dayAt(offset);
  return {
    id: `${habitId}:${dayKey(at)}`,
    type: "checkin",
    occurredAt: at.toISOString(),
    inputMethod: "checkin",
    isEstimate: false,
    detail: { habitId, habitName: "Creatine", kind: "plain", answer } as LocalEntry["detail"],
    syncState: "synced",
  };
}

const stats = (entries: LocalEntry[], vacationRanges: Array<{ start: string; end: string }> = []) =>
  habitStats({ habitId: HABIT, entries, today: TODAY, vacationRanges });

describe("doneDayKeys", () => {
  test("keeps only this habit's `yes` check-ins, keyed by the day they answer", () => {
    const keys = doneDayKeys(
      [checkin(0), checkin(1, "no"), checkin(2, "yes", "other"), checkin(3)],
      HABIT,
    );
    expect([...keys].sort()).toEqual(["2026-06-12", "2026-06-15"]);
  });

  test("ignores non-checkin entries", () => {
    const meal = { ...checkin(0), type: "meal" as const };
    expect(doneDayKeys([meal], HABIT).size).toBe(0);
  });
});

describe("counters", () => {
  test("month count, lifetime total and top-2 weekdays come from the entries", () => {
    // Mondays (0, 7, 14 days back) + one Tuesday (13) + one from a prior month (60).
    const s = stats([checkin(0), checkin(7), checkin(14), checkin(13), checkin(60)]);
    expect(s.totalCount).toBe(5);
    expect(s.monthCount).toBe(4); // the 60-day-old one falls in April
    expect(s.topWeekdays).toEqual([1, 2]); // Monday ×3, then Tuesday ×1
  });

  test("top weekdays drop zero-count days and break ties Mon-first", () => {
    const s = stats([checkin(0), checkin(4)]); // Mon and Thu, one each
    expect(s.topWeekdays).toEqual([1, 4]);
  });
});

describe("month calendar", () => {
  test("leading blanks put day 1 under its weekday, future days are marked", () => {
    const s = stats([checkin(0), checkin(2)]);
    expect(s.calendar.filter((c) => c.day == null)).toHaveLength(1); // 2026-06-01 is a Monday
    const days = s.calendar.filter((c) => c.day != null);
    expect(days).toHaveLength(30); // June
    expect(days[14]).toMatchObject({ day: 15, offset: 0, done: true, future: false });
    expect(days[12]).toMatchObject({ day: 13, done: true });
    expect(days[13]).toMatchObject({ day: 14, done: false });
    expect(days[15]).toMatchObject({ day: 16, future: true, done: false });
  });

  test("vacation is annotated from the real ranges, not a hardcoded window", () => {
    const s = stats([checkin(0)], [{ start: "2026-06-10", end: "2026-06-12" }]);
    const on = s.calendar.filter((c) => c.onVacation).map((c) => c.day);
    expect(on).toEqual([10, 11, 12]);
  });

  test("a full-ISO range still matches (server ranges carry a time part)", () => {
    const s = stats([], [{ start: "2026-06-10T00:00:00Z", end: "2026-06-10T23:59:59Z" }]);
    expect(s.calendar.filter((c) => c.onVacation).map((c) => c.day)).toEqual([10]);
  });
});

describe("by-month history", () => {
  test("8 bars ending on the current month, counted per calendar month", () => {
    const s = stats([checkin(0), checkin(1), checkin(40)]); // June ×2, May ×1
    expect(s.months).toHaveLength(MONTH_BARS);
    expect(s.months.map((m) => m.count)).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
    expect(s.months[7]).toMatchObject({ current: true });
    expect(s.months[0]!.date.getMonth()).toBe(10); // Nov 2025
    expect(s.months[0]!.date.getFullYear()).toBe(2025);
  });
});

describe("by-weekday frequency (last 30 days)", () => {
  test("Mon-first, counting only the 30-day window", () => {
    const s = stats([checkin(0), checkin(7), checkin(35), checkin(2)]);
    expect(s.weekdays.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(s.weekdays[0]).toMatchObject({ weekday: 1, count: 2, share: 1 }); // 35 is outside the window
    expect(s.weekdays[5]).toMatchObject({ weekday: 6, count: 1, share: 0.5 });
    expect(s.weekdays[1]!.count).toBe(0);
  });
});

describe("empty history", () => {
  const s = stats([]);

  test("renders the empty shape without dividing by zero", () => {
    expect(s.totalCount).toBe(0);
    expect(s.monthCount).toBe(0);
    expect(s.topWeekdays).toEqual([]);
    expect(s.since).toBeNull();
    expect(s.months.every((m) => m.count === 0)).toBe(true);
    expect(s.weekdays.every((w) => w.count === 0 && w.share === 0)).toBe(true);
    expect(s.calendar.every((c) => !c.done)).toBe(true);
  });

  test("every derived geometry stays finite", () => {
    const max = Math.max(...s.months.map((m) => m.count));
    for (const m of s.months) expect(monthBarHeight(m.count, max)).toBe(5);
    for (const w of s.weekdays) {
      expect(weekdayDiameter(w.share)).toBe(8);
      expect(weekdayOpacity(w.count, w.share)).toBe(0.25);
    }
  });
});

describe("geometry", () => {
  test("bar height is round(count/max*42 + 5)", () => {
    expect(monthBarHeight(4, 4)).toBe(47);
    expect(monthBarHeight(2, 4)).toBe(26);
  });

  test("circle Ø 8 + share*14, opacity .35 + share*.65", () => {
    expect(weekdayDiameter(1)).toBe(22);
    expect(weekdayOpacity(3, 1)).toBeCloseTo(1);
    expect(weekdayOpacity(1, 0.5)).toBeCloseTo(0.675);
  });

  test("only days inside the dock's 10-day reach can be opened", () => {
    expect(canOpenDay(0)).toBe(true);
    expect(canOpenDay(9)).toBe(true);
    expect(canOpenDay(10)).toBe(false);
    expect(canOpenDay(-1)).toBe(false); // future
  });
});

describe("since", () => {
  test("is the earliest recorded day", () => {
    expect(stats([checkin(3), checkin(40), checkin(0)]).since).toEqual(new Date(2026, 4, 6));
  });
});
