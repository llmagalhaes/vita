import "../../i18n";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry } from "../../db/entries";
import type { LocalEntry } from "../../db/entries";
import { setNotifier, stubNotifier } from "../notifier";
import { plannedRecap, syncRecapFromLog } from "../recap";

const meal = (): LocalEntry =>
  ({ type: "meal", detail: { totals: { kcal: 300 } } }) as unknown as LocalEntry;
const workout = (): LocalEntry => ({ type: "workout", detail: { kcal: 200 } }) as unknown as LocalEntry;
const water = (ml: number): LocalEntry => ({ type: "water", detail: { amountMl: ml } }) as unknown as LocalEntry;

const before = new Date(2026, 6, 23, 10, 0, 0); // 10:00
const after = new Date(2026, 6, 23, 21, 0, 0); // 21:00 (past 20:30)
const on = { enabled: true, paused: false };

test("plannedRecap builds the recap line + fresh tail when logs exist before cutoff", () => {
  const p = plannedRecap([meal(), meal(), workout(), water(1250)], before, on);
  expect(p).not.toBeNull();
  expect(p!.body).toContain("2 meals");
  expect(p!.body).toContain("a workout");
  expect(p!.body).toContain("1,250 ml");
  expect(p!.body).toContain("logged, not judged.");
  expect(p!.body).toContain("Tomorrow starts fresh.");
});

test("plannedRecap returns null after 20:30, when off, when paused, and when empty", () => {
  expect(plannedRecap([meal()], after, on)).toBeNull(); // after cutoff
  expect(plannedRecap([meal()], before, { enabled: false, paused: false })).toBeNull(); // off
  expect(plannedRecap([meal()], before, { enabled: true, paused: true })).toBeNull(); // paused
  expect(plannedRecap([], before, on)).toBeNull(); // nothing logged
});

describe("syncRecapFromLog drives the notifier seam", () => {
  beforeEach(() => {
    resetDbForTests();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  test("schedules one recap when something is logged before cutoff", async () => {
    jest.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
    const stub = stubNotifier();
    setNotifier(stub);
    addLocalEntry({ type: "water", occurredAt: new Date().toISOString(), inputMethod: "tap", isEstimate: false, detail: { amountMl: 500 } });

    await syncRecapFromLog();
    expect(stub.calls.recap).toHaveLength(1);
    expect(stub.calls.recap[0]).not.toBeNull();
    expect(stub.calls.recap[0]!.body).toContain("500 ml");
  });

  test("cancels (null) when nothing is logged today", async () => {
    jest.setSystemTime(new Date(2026, 6, 23, 10, 0, 0));
    const stub = stubNotifier();
    setNotifier(stub);

    await syncRecapFromLog();
    expect(stub.calls.recap).toEqual([null]);
  });
});
