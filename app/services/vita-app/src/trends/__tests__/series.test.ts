// Pin TZ so SQLite's `'localtime'` bucketing and the JS bucket keys agree in CI.
process.env.TZ = "UTC";

import type { NewEntry } from "../../api/client";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry, upsertEntry } from "../../db/entries";
import {
  RANGE_N,
  avgLinePct,
  barGap,
  barHeightPct,
  chartStats,
  ordinal,
  rangeDates,
  rangeEnd,
  readBuckets,
  tipLeftPct,
  weightPoints,
  weightSeries,
  yearCounters,
} from "../series";

// Local noon so nothing flips a calendar day.
const TODAY = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15
const at = (daysAgo: number, hour = 12): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const add = (e: NewEntry) => addLocalEntry(e);
const meal = (daysAgo: number, kcal: number) =>
  add({ type: "meal", occurredAt: at(daysAgo), inputMethod: "tap", isEstimate: true, detail: { title: "m", items: [], totals: { kcal } } });
const water = (daysAgo: number, amountMl: number) =>
  add({ type: "water", occurredAt: at(daysAgo), inputMethod: "tap", isEstimate: false, detail: { amountMl } });
const workout = (daysAgo: number, kcal?: number) =>
  add({
    type: "workout",
    occurredAt: at(daysAgo, 18),
    inputMethod: "tap",
    isEstimate: true,
    detail: { title: "Leg day", ...(kcal != null ? { kcal } : {}) },
  });

beforeEach(() => resetDbForTests());

describe("range buckets", () => {
  test("W/M are days ending today; Y is 12 month-starts ending this month", () => {
    expect(rangeDates("W", TODAY)).toHaveLength(RANGE_N.W);
    expect(rangeDates("M", TODAY)).toHaveLength(30);
    const y = rangeDates("Y", TODAY);
    expect(y).toHaveLength(12);
    expect([y[11]!.getFullYear(), y[11]!.getMonth(), y[11]!.getDate()]).toEqual([2026, 5, 1]);
    expect([y[0]!.getFullYear(), y[0]!.getMonth()]).toEqual([2025, 6]); // 11 months back
  });

  test("rangeEnd is tomorrow's local midnight (half-open upper bound)", () => {
    const e = rangeEnd(TODAY);
    expect([e.getDate(), e.getHours()]).toEqual([16, 0]);
  });
});

describe("readBuckets (one GROUP BY, never a JS map over a year)", () => {
  test("sums each type into its local day and leaves gaps zeroed + unrecorded", () => {
    meal(0, 500);
    meal(0, 300);
    water(0, 250);
    water(2, 500);
    workout(2, 320);
    meal(20, 999); // outside the week

    const b = readBuckets("W", TODAY);
    expect(b).toHaveLength(7);
    const today = b[6]!;
    expect(today.key).toBe("2026-06-15");
    expect(today.kcal).toBe(800); // the week's last bar is LIVE — today's own totals
    expect(today.waterMl).toBe(250);
    expect(today.recorded).toBe(true);

    const twoAgo = b[4]!;
    expect(twoAgo.waterMl).toBe(500);
    expect(twoAgo.moveKcal).toBe(320);
    expect(twoAgo.workouts).toBe(1);

    const gap = b[3]!;
    expect(gap.kcal).toBe(0);
    expect(gap.recorded).toBe(false); // an absence, never an assumption
    expect(b.reduce((s, x) => s + x.kcal, 0)).toBe(800); // the 20-day-old meal is out
  });

  // A month bar is a DAILY AVERAGE, not a monthly sum: twelve summed kcal totals are
  // a number with no physical meaning, and the divisor is recorded days — a day
  // nobody logged never dilutes the average (handoff v4.1 §3).
  test("Y buckets by month and averages over the days that carry the metric", () => {
    meal(0, 400);
    meal(40, 600); // ~May 6
    meal(41, 800); // ~May 5 — a second recorded May day
    meal(41, 200); // same day: 1000 that day, still ONE recorded day
    water(40, 2000);
    const b = readBuckets("Y", TODAY);
    expect(b).toHaveLength(12);
    expect(b[11]!.key).toBe("2026-06");
    expect(b[11]!.kcal).toBe(400); // one recorded day → that day's total
    expect(b[10]!.key).toBe("2026-05");
    expect(b[10]!.kcal).toBe(800); // (600 + 1000) / 2 recorded days, not 1600
    expect(b[10]!.waterMl).toBe(2000); // one water day in May, not 2000/31
  });

  test("a day with only a weight reading is not a 'record' bucket", () => {
    upsertEntry("weight:2026-06-14", {
      type: "weight",
      occurredAt: at(1),
      inputMethod: "tap",
      isEstimate: false,
      detail: { kg: 78.4 },
    });
    expect(readBuckets("W", TODAY)[5]!.recorded).toBe(false);
  });
});

describe("yearCounters", () => {
  test("counts distinct recorded days and the LIVE day-of-year", () => {
    meal(0, 100);
    meal(0, 200); // same day — one day, not two
    water(1, 250);
    workout(3);
    const c = yearCounters(TODAY);
    expect(c.recorded).toBe(3);
    expect(c.waterDays).toBe(1);
    expect(c.dayOfYear).toBe(166); // 2026-06-15
  });

  test("last year's rows never leak into this year's counter", () => {
    meal(300, 500); // 2025
    expect(yearCounters(TODAY).recorded).toBe(0);
  });
});

describe("weightSeries", () => {
  const weigh = (daysAgo: number, kg: number) => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - daysAgo);
    upsertEntry(`weight:x${daysAgo}`, {
      type: "weight",
      occurredAt: at(daysAgo, 7),
      inputMethod: "tap",
      isEstimate: false,
      detail: { kg },
    });
  };

  test("one point per bucket (the last reading), oldest→newest, gaps omitted", () => {
    weigh(4, 79.1);
    weigh(0, 78.4);
    const s = weightSeries("W", TODAY);
    expect(s.map((p) => p.kg)).toEqual([79.1, 78.4]); // 5 empty days simply have no point
  });

  test("no readings in range → an empty series, not a fake line", () => {
    expect(weightSeries("W", TODAY)).toEqual([]);
  });
});

describe("chart geometry (README §3)", () => {
  test("bar height is max(4, round(v/max*96)) percent", () => {
    expect(barHeightPct(0, 1000)).toBe(4); // the floor keeps an empty day visible
    expect(barHeightPct(1000, 1000)).toBe(96);
    expect(barHeightPct(500, 1000)).toBe(48);
    expect(barHeightPct(0, 0)).toBe(4); // an all-empty range: max floored at 1, no NaN
  });

  test("gap is 6px up to 12 bars, 2px for the 30-day month", () => {
    expect(barGap(7)).toBe(6);
    expect(barGap(12)).toBe(6);
    expect(barGap(30)).toBe(2);
  });

  test("tooltip sits over the bar centre", () => {
    expect(tipLeftPct(0, 7)).toBeCloseTo((0.5 / 7) * 100, 5);
    expect(tipLeftPct(6, 7)).toBeCloseTo((6.5 / 7) * 100, 5);
  });

  test("the dashed average line uses the raw ratio (no 4% floor, no rounding)", () => {
    expect(avgLinePct(500, 1000)).toBe(48);
    expect(avgLinePct(0, 0)).toBe(0);
  });

  test("ordinal reads 1st/2nd/3rd/4th, and 11th–13th are not 'st/nd/rd'", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "111th",
    ]);
  });

  test("weight polyline spans 57→13 and flattens when every reading is equal", () => {
    const pts = weightPoints([78, 80], 306);
    expect(pts[0]).toEqual({ x: 0, y: 57 });
    expect(pts[1]).toEqual({ x: 306, y: 13 });
    expect(weightPoints([78, 78], 306).map((p) => p.y)).toEqual([57, 57]);
    expect(weightPoints([78], 306)[0]!.x).toBe(153); // a lone reading sits centred
  });
});

/**
 * The card's whole point is that the numbers can't lie about days nobody recorded
 * (handoff v4.1 §3). Every assertion here is the FORMULA — the prototype's literals
 * belong to its mock arrays, not to a real user's series.
 */
describe("chartStats", () => {
  // The handoff's own worked example, generated instead of pasted: 18 recorded
  // workout days in 30, 405 kcal each.
  const moveMonth = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 || i % 5 === 1 || i % 5 === 2 ? 405 : 0));

  test("the average is over RECORDED buckets — an unrecorded day never becomes a zero", () => {
    const s = chartStats([100, 0, 300, 0]);
    expect(s.avg).toBe(200); // not 100
    expect(s.recorded).toBe(2);
    expect(s.n).toBe(4);
  });

  test("per week is total ÷ calendar weeks, NEVER avg × 7", () => {
    const s = chartStats(moveMonth);
    expect(s.recorded).toBe(18);
    expect(s.total).toBe(7290);
    expect(s.avg).toBe(405); // per session day
    expect(s.perWeek).toBeCloseTo(7290 / (30 / 7), 6); // 1701
    expect(s.perWeek).not.toBeCloseTo(s.avg * 7, 0); // 2835 would claim 7 sessions a week
  });

  test("the lowest is the lowest RECORDED value — a zero is an absence, not a low", () => {
    const s = chartStats([0, 900, 300, 700]);
    expect(s.loValue).toBe(300);
    expect(s.loIndex).toBe(2);
    expect(s.hiValue).toBe(900);
    expect(s.hiIndex).toBe(1);
  });

  test("rank counts down the recorded buckets; a zero bucket has none", () => {
    const s = chartStats([0, 900, 300, 700]);
    expect(s.rank(1)).toBe(1);
    expect(s.rank(3)).toBe(2);
    expect(s.rank(2)).toBe(3);
    expect(s.rank(0)).toBeNull(); // no record → no rank, and no deviation pill
    expect(s.rank(9)).toBeNull(); // out of range
  });

  test("an empty range has no average, no peak and still scales", () => {
    const s = chartStats([0, 0, 0]);
    expect([s.avg, s.recorded, s.total, s.hiValue, s.loValue]).toEqual([0, 0, 0, 0, 0]);
    expect(s.max).toBe(1); // no NaN in the bar math
  });
});
